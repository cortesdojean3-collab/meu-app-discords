const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicDir = path.resolve(__dirname, '../public');
const introSource = fs.readFileSync(path.join(publicDir, 'papo-intro.js'), 'utf8');
const pages = Object.fromEntries(['app', 'index'].map(name => [name,
  fs.readFileSync(path.join(publicDir, `${name}.html`), 'utf8')]));
const settlePromises = () => new Promise(resolve => setImmediate(resolve));

function storage(values = new Map()) {
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

function eventTarget() {
  const handlers = new Map();
  return {
    addEventListener(name, fn) {
      const list = handlers.get(name) || new Set();
      list.add(fn); handlers.set(name, list);
    },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      for (const fn of [...(handlers.get(event.type) || [])]) fn(event);
      return true;
    },
    listenerCount() { return [...handlers.values()].reduce((sum, list) => sum + list.size, 0); }
  };
}

function element(id) {
  const classes = new Set(), attributes = new Map();
  return Object.assign(eventTarget(), {
    id, classes, attributes, dataset: {}, style: { setProperty(name, value) { this[name] = value; } }, children: [], textContent: '', hidden: false, disabled: false,
    removed: false, focusCount: 0,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    append(...nodes) { this.children.push(...nodes); },
    remove() { this.removed = true; },
    querySelector() { return null; },
    closest() { return null; },
    click() {
      if (this.disabled) return;
      this.onclick?.();
      this.dispatchEvent({ type: 'click', target: this });
    }
  });
}

function virtualClock() {
  let now = 0, sequence = 0;
  const pending = new Map();
  return {
    pending,
    now: () => now,
    setTimeout(fn, delay = 0) {
      const id = ++sequence;
      pending.set(id, { at: now + Math.max(0, delay), fn });
      return id;
    },
    clearTimeout: id => pending.delete(id),
    async advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...pending].filter(([, item]) => item.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        now = next[1].at;
        pending.delete(next[0]);
        next[1].fn();
        await settlePromises();
      }
      now = end;
      await settlePromises();
    }
  };
}

function harness({ entry = 'app', preferences = {}, reduced = false, seen = new Map(), pendingPlay = false, mount = true, eventBootstrap } = {}) {
  const clock = virtualClock(), root = element('html'), screen = element('papo-intro');
  root.dataset.papoEntry = entry;
  const van = element('van'), image = element('image'), audio = element('papoMotorAudio');
  const sound = element('sound'), soundText = element('sound-text'), skip = element('skip');
  const status = element('papoIntroStatus'), au = element('au'), cin = element('cin');
  const profile = element('m1'), profileName = element('pname');
  const brand = element('intro-brand');
  const nodes = [root, screen, van, image, audio, sound, soundText, skip, status, au, cin, profile, profileName, brand];
  const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
  const document = Object.assign(eventTarget(), {
    documentElement: root, hidden: false, activeElement: null,
    createElement: name => element(name),
    getElementById: id => byId[id]?.removed ? null : byId[id] || null,
    querySelector: selector => selector === '[data-intro-skip]' ? skip : null
  });
  for (const node of nodes) node.focus = () => { node.focusCount++; document.activeElement = node; };
  van.querySelector = selector => selector === 'img' ? image : null;
  sound.querySelector = selector => selector === 'span' ? soundText : null;
  screen.querySelector = selector => ({ '.intro-van': van, '#papoMotorAudio': audio,
    '[data-intro-sound]': sound, '[data-intro-skip]': skip, '#papoIntroStatus': status, '.intro-brand': brand }[selector] || null);
  const playResolvers = [];
  Object.assign(audio, {
    paused: true, duration: 6, currentTime: 0, playCalls: 0, pauseCalls: 0,
    pause() { this.pauseCalls++; this.paused = true; },
    play() {
      this.playCalls++;
      if (!pendingPlay) { this.paused = false; return Promise.resolve(); }
      return new Promise(resolve => playResolvers.push(() => { this.paused = false; resolve(); }));
    }
  });
  const window = eventTarget();
  window.PapoEventBootstrap = eventBootstrap;
  let reloads = 0;
  const context = vm.createContext({
    window, document, localStorage: storage(new Map([['papo.extras.v1', JSON.stringify(preferences)]])),
    sessionStorage: storage(seen), matchMedia: () => ({ matches: reduced }),
    Event: class { constructor(type) { this.type = type; } },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, performance: { now: clock.now },
    location: { reload: () => reloads++ }, console: { warn() {} },
    getComputedStyle: () => ({ getPropertyValue: name => ({
      '--intro-drive-duration': '3.8s', '--intro-drive-delay': '200ms', '--intro-fade-duration': '450ms'
    }[name] || '') })
  });
  const html = pages[entry === 'app' ? 'app' : 'index'];
  const bootstrap = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).find(source => source.includes('window.PapoStartup'));
  assert.ok(bootstrap, 'entry page must provide its startup bootstrap');
  vm.runInContext(bootstrap, context, { filename: `${entry}-bootstrap.js` });
  const runIntro = () => vm.runInContext(introSource, context, { filename: 'papo-intro.js' });
  if (mount) runIntro();
  return {
    clock, root, screen, van, image, audio, sound, soundText, skip, status, au, cin, brand, document,
    window, seen, runIntro, playResolvers, startup: window.PapoStartup,
    reloads: () => reloads,
    listeners: () => nodes.reduce((sum, node) => sum + node.listenerCount(), document.listenerCount() + window.listenerCount()),
    finishDrive: () => van.dispatchEvent({ type: 'animationend', target: van, animationName: 'papo-drive' })
  };
}

for (const outcome of ['login', 'app']) {
  test(`${outcome}: completed initialization waits for the complete Kombi crossing`, async () => {
    const h = harness();
    h.startup.markReady(outcome);
    await h.clock.advance(200);
    assert.equal(h.audio.playCalls, 1);
    assert.equal(h.root.classes.has('papo-intro-reveal'), false);
    assert.equal(h.screen.removed, false);
    h.finishDrive();
    assert.equal(h.audio.paused, true);
    assert.equal(h.root.classes.has('papo-intro-reveal'), true);
    assert.equal(h.screen.removed, false, 'screen stays during its fade');
    await h.clock.advance(500);
    assert.equal(h.screen.removed, true);
    assert.equal(h.startup.complete, true);
    assert.equal((outcome === 'login' ? h.au : h.cin).focusCount, 1);
    assert.equal(h.listeners(), 0);
    assert.equal(h.clock.pending.size, 0);
  });

  test(`${outcome}: completed crossing waits for initialization without continuing the motor`, async () => {
    const h = harness();
    await h.clock.advance(200);
    h.finishDrive();
    assert.equal(h.audio.paused, true);
    await h.clock.advance(2000);
    assert.equal(h.root.classes.has('papo-intro-reveal'), false);
    assert.equal(h.screen.removed, false);
    h.startup.markReady(outcome);
    assert.equal(h.root.classes.has('papo-intro-reveal'), true);
    await h.clock.advance(500);
    assert.equal(h.screen.removed, true);
  });
}

test('skip stops the motor but cannot expose the app before the session is resolved', async () => {
  const h = harness();
  await h.clock.advance(200);
  assert.equal(h.audio.paused, false);
  h.skip.click();
  assert.equal(h.audio.paused, true);
  assert.equal(h.image.src, '/kombi.svg#still');
  await h.clock.advance(4500);
  assert.equal(h.root.classes.has('papo-intro-reveal'), false);
  assert.equal(h.screen.removed, false);
  assert.equal(h.audio.playCalls, 1);
  h.startup.markReady('login');
  await h.clock.advance(500);
  assert.equal(h.screen.removed, true);
});

for (const [description, options] of [
  ['system reduced motion', { reduced: true }],
  ['stored reduced motion', { preferences: { reduceMotion: true } }],
  ['disabled animation', { preferences: { kombiIntro: false } }],
  ['already seen app intro', { seen: new Map([['papo.intro.app.seen.v2', '1']]) }]
]) {
  test(`${description} waits for readiness with no motor or crossing delay`, async () => {
    const h = harness(options);
    assert.equal(h.startup.animate, false);
    await h.clock.advance(600);
    assert.equal(h.audio.playCalls, 0);
    assert.equal(h.screen.removed, false);
    h.startup.markReady('login');
    assert.equal(h.root.classes.has('papo-intro-reveal'), true);
    await h.clock.advance(500);
    assert.equal(h.screen.removed, true, 'quiet loading does not add the four-second crossing');
    assert.equal(h.audio.playCalls, 0);
  });
}

test('landing and app each play once per session and do not consume each other’s visit', async () => {
  const seen = new Map();
  const landing = harness({ entry: 'landing', seen });
  landing.finishDrive();
  await landing.clock.advance(500);
  assert.equal(landing.screen.removed, true);
  const app = harness({ seen });
  assert.equal(app.startup.animate, true);
  app.startup.markReady('app');
  app.finishDrive();
  await app.clock.advance(500);
  const nextLanding = harness({ entry: 'landing', seen });
  assert.equal(nextLanding.startup.animate, false);
  assert.equal(nextLanding.screen.removed, true);
  const nextApp = harness({ seen });
  assert.equal(nextApp.startup.animate, false);
  assert.equal(nextApp.screen.removed, false, 'repeat app startup still waits for its session');
  nextApp.startup.markReady('app');
  await nextApp.clock.advance(500);
  assert.equal(nextApp.audio.playCalls, 0);
  assert.equal(nextApp.screen.removed, true);
});

test('loading the intro controller twice does not duplicate listeners, timers or sound', async () => {
  const h = harness();
  const listeners = h.listeners(), timers = h.clock.pending.size;
  h.runIntro();
  assert.equal(h.listeners(), listeners);
  assert.equal(h.clock.pending.size, timers);
  await h.clock.advance(200);
  assert.equal(h.audio.playCalls, 1);
});

test('an audio play promise resolving after skip cannot reactivate the motor or its control', async () => {
  const h = harness({ pendingPlay: true });
  await h.clock.advance(200);
  h.skip.click();
  assert.equal(h.audio.paused, true);
  h.playResolvers[0]();
  await settlePromises();
  assert.equal(h.audio.paused, true);
  assert.equal(h.sound.attributes.get('aria-pressed'), 'false');
  assert.equal(h.sound.disabled, true);
  h.startup.markReady('login');
  await h.clock.advance(500);
  assert.equal(h.screen.removed, true);
});

test('a stale audio promise cannot silence a new valid play attempt after the user toggles sound', async () => {
  const h = harness({ pendingPlay: true });
  await h.clock.advance(200);
  assert.equal(h.audio.playCalls, 1);
  h.sound.click();
  assert.equal(h.audio.paused, true);
  h.sound.click();
  assert.equal(h.audio.playCalls, 2);
  h.playResolvers[1]();
  await settlePromises();
  assert.equal(h.audio.paused, false);
  assert.equal(h.sound.attributes.get('aria-pressed'), 'true');
  const pauseCalls = h.audio.pauseCalls;
  h.playResolvers[0]();
  await settlePromises();
  assert.equal(h.audio.paused, false);
  assert.equal(h.audio.pauseCalls, pauseCalls, 'older attempt must not pause the currently wanted motor');
  assert.equal(h.sound.attributes.get('aria-pressed'), 'true');
  h.finishDrive();
  assert.equal(h.audio.paused, true);
});

test('a controller loaded after the CSS crossing finished reveals a ready app without replaying the crossing or motor', async () => {
  const h = harness({ mount: false });
  await h.clock.advance(4500);
  h.van.getAnimations = () => [{ animationName: 'papo-drive', currentTime: 4000, playState: 'finished' }];
  h.startup.markReady('app');
  assert.equal(h.root.classes.has('papo-intro-reveal'), false);
  h.runIntro();
  assert.equal(h.root.classes.has('papo-intro-reveal'), true);
  assert.equal(h.audio.playCalls, 0);
  await h.clock.advance(500);
  assert.equal(h.screen.removed, true, 'only the normal fade remains after an already finished crossing');
  assert.equal(h.audio.playCalls, 0);
  assert.equal(h.clock.pending.size, 0);
  assert.equal(h.listeners(), 0);
});

test('an unavailable audio file does not prevent the transition after initialization and crossing', async () => {
  const h = harness();
  await h.clock.advance(200);
  h.audio.dispatchEvent({ type: 'error' });
  assert.equal(h.audio.paused, true);
  assert.equal(h.sound.disabled, true);
  h.startup.markReady('app');
  h.finishDrive();
  await h.clock.advance(500);
  assert.equal(h.screen.removed, true);
});

test('the motor fades from its normal volume to silence at the end of the crossing and releases all timers', async () => {
  const h = harness();
  h.startup.markReady('app');
  await h.clock.advance(200);
  assert.equal(h.audio.paused, false);
  assert.equal(h.audio.volume, .45);
  await h.clock.advance(3640);
  assert.ok(h.audio.volume > .15 && h.audio.volume < .3, 'motor is at an intermediate fade volume');
  assert.equal(h.audio.paused, false);
  await h.clock.advance(185);
  assert.ok(h.audio.volume <= .01, 'motor reaches silence near the end of the crossing');
  h.finishDrive();
  assert.equal(h.audio.paused, true);
  await h.clock.advance(500);
  assert.equal(h.screen.removed, true);
  assert.equal(h.clock.pending.size, 0);
  assert.equal(h.listeners(), 0);
});

test('missing animationend uses the crossing fallback without revealing before readiness', async () => {
  const h = harness();
  await h.clock.advance(4250);
  assert.equal(h.audio.paused, true);
  assert.equal(h.screen.removed, false);
  assert.equal(h.root.classes.has('papo-intro-reveal'), false);
  h.startup.markReady('login');
  await h.clock.advance(500);
  assert.equal(h.screen.removed, true);
});

test('pagehide pauses audio and removes all controller listeners and timers', async () => {
  const h = harness({ pendingPlay: true });
  await h.clock.advance(200);
  assert.ok(h.listeners() > 0);
  h.window.dispatchEvent({ type: 'pagehide' });
  assert.equal(h.audio.paused, true);
  assert.equal(h.screen.removed, true);
  assert.equal(h.clock.pending.size, 0);
  assert.equal(h.listeners(), 0);
  assert.equal(h.au.focusCount + h.cin.focusCount, 0);
  h.playResolvers[0]();
  await settlePromises();
  assert.equal(h.audio.paused, true);
});

test('missing intro controller retains a safe failure screen and offers reload', async () => {
  const h = harness({ mount: false });
  await h.clock.advance(10000);
  assert.equal(h.screen.removed, false);
  assert.equal(h.root.classes.has('papo-intro-pending'), true);
  assert.match(h.status.textContent, /Recarregue/);
  h.skip.click();
  assert.equal(h.reloads(), 1);
  h.startup.markReady('login');
  assert.equal(h.screen.removed, true, 'a late session result can release the bootstrap fallback');
  assert.equal(h.root.classes.has('papo-intro-pending'), false);
});

test('failed app initialization offers reload instead of displaying an unresolved app', async () => {
  const h = harness();
  await h.clock.advance(8500);
  assert.equal(h.screen.removed, false);
  assert.equal(h.root.classes.has('papo-intro-reveal'), false);
  assert.equal(h.audio.paused, true);
  assert.equal(h.clock.pending.size, 0);
  assert.match(h.status.textContent, /Recarregue/);
  assert.equal(h.skip.hidden, false);
  h.skip.click();
  assert.equal(h.reloads(), 1);
});

test('a slow network timeout can choose the retry screen and safely finish loading', async () => {
  const h = harness();
  let timeoutCalls = 0;
  h.startup.onTimeout = () => { timeoutCalls++; h.startup.markReady('offline'); };
  await h.clock.advance(9000);
  assert.equal(timeoutCalls, 1);
  assert.equal(h.screen.removed, true);
  assert.equal(h.startup.outcome, 'offline');
  assert.equal(h.audio.paused, true);
  assert.equal(h.listeners(), 0);
  assert.equal(h.clock.pending.size, 0);
});

test('an active anniversary keeps the original drive and motor then briefly shows its greeting', async () => {
  const h = harness({ eventBootstrap: { active: true, features: { intro: true } } });
  assert.equal(h.image.src, '/kombi-flowers.svg');
  assert.equal(h.screen.classes.has('intro-anniversary'), true);
  const petals = h.screen.children.find(node => node.className === 'intro-event-petals');
  assert.equal(petals.children.length, 12, 'decoration is bounded and cannot accumulate');
  h.startup.markReady('app');
  await h.clock.advance(200);
  assert.equal(h.audio.playCalls, 1);
  h.finishDrive();
  assert.equal(h.audio.paused, true, 'the greeting does not extend the motor sound');
  assert.equal(h.screen.classes.has('intro-event-message'), true);
  assert.equal(h.root.classes.has('papo-intro-reveal'), false);
  const note = h.brand.children[0];
  assert.equal(note.children[0].textContent, '3 anos desde que nossos caminhos se cruzaram. 💜');
  assert.equal(note.children[1].textContent, 'Nosso Pequeno Infinito');
  await h.clock.advance(1399);
  assert.equal(h.root.classes.has('papo-intro-reveal'), false);
  await h.clock.advance(1);
  assert.equal(h.root.classes.has('papo-intro-reveal'), true);
  await h.clock.advance(500);
  assert.equal(h.screen.removed, true);
  assert.equal(h.clock.pending.size, 0);
  assert.equal(h.listeners(), 0);
});

test('an anniversary greeting cannot release an unresolved session and skip adds no event delay', async () => {
  const h = harness({ eventBootstrap: { active: true } });
  h.finishDrive();
  await h.clock.advance(1800);
  assert.equal(h.root.classes.has('papo-intro-reveal'), false);
  h.startup.markReady('login');
  await h.clock.advance(500);
  assert.equal(h.screen.removed, true);
  const skip = harness({ eventBootstrap: { active: true } });
  await skip.clock.advance(200);
  skip.skip.click();
  assert.equal(skip.image.src, '/kombi-flowers.svg#still');
  assert.equal(skip.audio.paused, true);
  skip.startup.markReady('app');
  await skip.clock.advance(500);
  assert.equal(skip.screen.removed, true);
  assert.equal(skip.clock.pending.size, 0);
});

test('quiet anniversary loading uses a static floral Kombi without particles, sound or greeting delay', async () => {
  const h = harness({ reduced: true, eventBootstrap: { active: true } });
  assert.equal(h.image.src, '/kombi-flowers.svg#still');
  assert.equal(h.screen.children.some(node => node.className === 'intro-event-petals'), false);
  assert.equal(h.screen.classes.has('intro-event-message'), true);
  h.startup.markReady('login');
  await h.clock.advance(50);
  assert.equal(h.screen.removed, true);
  assert.equal(h.audio.playCalls, 0);
  assert.equal(h.clock.pending.size, 0);
});

test('future, ended and administratively disabled event intros retain the normal Kombi', async () => {
  for (const eventBootstrap of [{ active: false, status: 'future' }, { active: false, status: 'ended' },
    { active: true, features: { intro: false } }]) {
    const h = harness({ eventBootstrap });
    assert.equal(h.screen.classes.has('intro-anniversary'), false);
    h.startup.markReady('app');
    h.finishDrive();
    assert.equal(h.root.classes.has('papo-intro-reveal'), true);
    await h.clock.advance(500);
    assert.equal(h.screen.removed, true);
  }
});

test('disabled effects prevent anniversary petals and pagehide cleans an in-progress greeting', async () => {
  const h = harness({ preferences: { easterEggs: false }, eventBootstrap: { active: true } });
  assert.equal(h.screen.children.some(node => node.className === 'intro-event-petals'), false);
  h.finishDrive();
  assert.equal(h.screen.classes.has('intro-event-message'), true);
  h.window.dispatchEvent({ type: 'pagehide' });
  assert.equal(h.screen.removed, true);
  assert.equal(h.clock.pending.size, 0);
  assert.equal(h.listeners(), 0);
  await h.clock.advance(2000);
  assert.equal(h.root.classes.has('papo-intro-reveal'), false);
});

test('the administrator can disable anniversary intro petals while preserving its floral Kombi and greeting', async () => {
  const h = harness({ eventBootstrap: { active: true, decorations: { petals: false } } });
  assert.equal(h.image.src, '/kombi-flowers.svg');
  assert.equal(h.screen.classes.has('intro-anniversary'), true);
  assert.equal(h.screen.children.some(node => node.className === 'intro-event-petals'), false);
  h.startup.markReady('app');
  h.finishDrive();
  assert.equal(h.screen.classes.has('intro-event-message'), true);
  await h.clock.advance(1900);
  assert.equal(h.screen.removed, true);
  assert.equal(h.clock.pending.size, 0);
});
