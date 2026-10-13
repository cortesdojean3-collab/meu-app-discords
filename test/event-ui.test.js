const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/papo-event.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../public/papo-event.css'), 'utf8');

function emitter() {
  const handlers = new Map();
  return {
    addEventListener(type, handler) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(handler); },
    removeEventListener(type, handler) { handlers.get(type)?.delete(handler); },
    dispatchEvent(event) { event.target ||= this; for (const fn of [...handlers.get(event.type) || []]) fn(event); },
    listenerCount() { return [...handlers.values()].reduce((total, set) => total + set.size, 0); }
  };
}
function harness() {
  let now = 0, localClock = 0, sequence = 0, document;
  const pending = new Map(), requests = [], storage = new Map();
  const base = Date.parse('2026-10-12T12:00:00-03:00');
  const dataKey = name => name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  function matches(item, selector) {
    if (selector.startsWith('#')) return item.id === selector.slice(1);
    if (selector.startsWith('.')) return item.classList.contains(selector.slice(1));
    if (selector.startsWith('[')) {
      const [, name, expected] = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/) || [];
      const value = item.getAttribute(name); return expected === undefined ? value !== null : value === expected;
    }
    return item.tagName.toLowerCase() === selector;
  }
  function query(item, selector) {
    const results = [], options = selector.split(',').map(s => s.trim());
    const walk = parent => {
      for (const child of parent.children) {
        if (options.some(option => {
          const terms = option.split(/\s+/), last = terms.pop(); if (!matches(child, last)) return false;
          let ancestor = child.parentNode;
          while (terms.length && ancestor) { if (matches(ancestor, terms.at(-1))) terms.pop(); ancestor = ancestor.parentNode; }
          return !terms.length;
        })) results.push(child);
        walk(child);
      }
    };
    walk(item); return results;
  }
  function element(tag = 'div') {
    const classes = new Set(), attributes = new Map();
    const result = Object.assign(emitter(), {
      tagName: tag.toUpperCase(), children: [], parentNode: null, id: '', textContent: '', dataset: {}, hidden: false, inert: false, disabled: false, scrollTop: 0,
      style: { setProperty(key, value) { this[key] = value; } },
      classList: {
        add(...names) { for (const name of names) classes.add(name); }, remove(...names) { for (const name of names) classes.delete(name); },
        contains: name => classes.has(name),
        toggle(name, forced) { const add = forced === undefined ? !classes.has(name) : forced; if (add) classes.add(name); else classes.delete(name); return add; }
      },
      setAttribute(key, value) { attributes.set(key, String(value)); if (key.startsWith('data-')) this.dataset[dataKey(key)] = String(value); if (key === 'id') this.id = String(value); },
      getAttribute(key) { if (key.startsWith('data-')) return this.dataset[dataKey(key)] ?? null; return attributes.get(key) ?? null; },
      append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } },
      insertBefore(child, before) { child.remove(); const position = this.children.indexOf(before); child.parentNode = this; this.children.splice(position < 0 ? this.children.length : position, 0, child); },
      replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); },
      remove() { if (this.parentNode) { const siblings = this.parentNode.children; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null; } },
      contains(child) { for (let parent = child; parent; parent = parent.parentNode) if (parent === this) return true; return false; },
      querySelector(selector) { return query(this, selector)[0] || null; }, querySelectorAll(selector) { return query(this, selector); },
      closest(selector) { for (let parent = this; parent; parent = parent.parentNode) if (matches(parent, selector)) return parent; return null; },
      focus() { document.activeElement = this; }, getClientRects() { return this.hidden ? [] : [{}]; }, scrollIntoView() {}
    });
    Object.defineProperty(result, 'className', { get: () => [...classes].join(' '), set(value) { classes.clear(); for (const name of value.split(/\s+/).filter(Boolean)) classes.add(name); } });
    Object.defineProperty(result, 'isConnected', { get: () => document.body.contains(result) });
    let rawMarkup = '';
    Object.defineProperty(result, 'innerHTML', { get: () => rawMarkup, set(value) { rawMarkup = value; result.replaceChildren(); if (value.includes('<svg')) result.append(element('svg')); } });
    return result;
  }
  const root = element('html'), body = element('body'); root.append(body);
  document = Object.assign(emitter(), { documentElement: root, body, hidden: false, activeElement: null, createElement: element, querySelector: s => root.querySelector(s), querySelectorAll: s => root.querySelectorAll(s) });
  const app = element(); app.id = 'app'; const side = element(); side.id = 'side'; const title = element('h3'); title.textContent = 'Papo'; const channels = element(); channels.id = 'chs'; side.append(title, channels); app.append(side);
  const call = element('video'); call.dataset.fixture = 'ongoing-call'; app.append(call); body.append(app);
  const window = emitter(), media = Object.assign(emitter(), { matches: false });
  const state = {
    status: 'active', serverNow: new Date(base).toISOString(), startsAt: '2026-10-10T00:00:00-03:00', endsAt: '2026-11-10T00:00:00-03:00', timeZone: 'America/Sao_Paulo', day: 3, lettersReleased: 3, daysRemaining: 29, finaleAvailable: false, discoveries: [], canAdmin: true, revision: 1,
    config: {
      title: 'Nosso Pequeno Infinito — 3 Anos de Nós', subtitle: 'Uma pequena comemoração.', mainText: 'Três anos de uma história especial.', features: {}, decorations: {}, allowMemories: false,
      flowers: ['rose', 'daisy', 'tulip', 'lavender', 'gold'].map(id => ({ id: `flower-${id}`, name: `Flor ${id}`, text: `Carinho da flor ${id}` })),
      letters: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, availableAt: new Date(base + i * 86400000).toISOString(), unlocked: i < 3, ...(i < 3 ? { text: `Carta segura ${i + 1}` } : {}) })),
      messages: { heart: 'Um encontro escrito nas estrelas.', delivery: 'Flores para você.', constellation: 'Uma lembrança no universo.', special: 'Um jardim inteiro.', finale: 'A história continua.' }
    }
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  let unavailable = false;
  const context = vm.createContext({ window, document, matchMedia: () => media, localStorage: { getItem: key => storage.get(key) ?? null },
    performance: { now: () => now }, Date: class extends Date { static now() { return localClock; } }, Intl, AbortController,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout(fn, delay) { const id = ++sequence; pending.set(id, { at: now + delay, fn }); return id; }, clearTimeout: id => pending.delete(id),
    async fetch(url, options = {}) {
      requests.push({ url, options });
      if (unavailable) throw new Error('offline');
      if (url === '/api/event/discover') { const { kind } = JSON.parse(options.body); if (!state.discoveries.includes(kind)) state.discoveries.push(kind); }
      if (url.startsWith('/api/event/letter/')) { const day = Number(url.split('/').at(-1)); return { ok: day <= 3, status: day <= 3 ? 200 : 403, json: async () => day <= 3 ? { text: `Texto verificado no servidor ${day}`, day, unlocked: true } : { erro: 'Ainda não liberada.' } }; }
      state.serverNow = new Date(base + now).toISOString(); return { ok: true, status: 200, json: async () => clone(state) };
    }
  });
  vm.runInContext(source, context);
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return {
    api: window.PapoEvent, state, document, window, media, requests, pending, call, app,
    select: selector => document.querySelector(selector), all: selector => document.querySelectorAll(selector), flush,
    async advance(milliseconds) { const until = now + milliseconds; for (;;) { const candidates = [...pending.entries()].filter(([, item]) => item.at <= until).sort((a, b) => a[1].at - b[1].at); if (!candidates.length) break; const [id, item] = candidates[0]; pending.delete(id); now = item.at; item.fn(); await flush(); } now = until; await flush(); },
    click(item) { item.focus(); item.dispatchEvent({ type: 'click', target: item }); document.dispatchEvent({ type: 'click', target: item }); },
    key(key, shiftKey = false) { const event = { type: 'keydown', key, shiftKey, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }; document.dispatchEvent(event); return event; },
    preferences(detail) { document.dispatchEvent({ type: 'papo:preferences-changed', detail }); },
    localClock(value) { localClock = value; }, offline(value = true) { unavailable = value; }
  };
}

test('event mounts once, shows server-unlocked letters and never trusts a changed local clock', async () => {
  const h = harness(); await h.flush();
  assert.equal(h.select('#papoEventNav').hidden, false);
  await h.api.open(); assert.equal(h.all('.pe-envelope').length, 30); assert.equal(h.all('.pe-unlocked').length, 3);
  h.localClock(Date.parse('2030-01-01')); h.click(h.all('.pe-envelope')[10]); await h.flush();
  assert.equal(h.requests.some(r => r.url.endsWith('/letter/11')), false);
  assert.match(h.select('#peAnnouncement').textContent, /floresce em/);
  h.click(h.all('.pe-envelope')[0]); await h.flush();
  assert.equal(h.select('.pe-letter-body').textContent, 'Texto verificado no servidor 1');
  assert.equal(h.all('#papoEventNav').length, 1); h.api.dispose();
});
test('a voluntary hub preserves live call elements, traps focus and restores the launch button', async () => {
  const h = harness(); await h.flush(); const launch = h.select('#papoEventNav'); launch.focus(); await h.api.open();
  assert.equal(h.app.inert, true); assert.equal(h.call.parentNode, h.app);
  const first = h.select('[data-pe-action="home"]'); first.focus(); const tab = h.key('Tab', true); assert.equal(tab.prevented, true);
  assert.equal(h.key('Escape').prevented, true); assert.equal(h.app.inert, false); assert.equal(h.document.activeElement, launch);
  assert.equal(h.call.parentNode, h.app); h.api.dispose();
});
test('each flower saves discovery and presents the configured message as text', async () => {
  const h = harness(); await h.flush(); await h.api.open();
  const first = h.all('.pe-flower')[0]; h.click(first); await h.flush();
  assert.deepEqual(h.state.discoveries, ['flower-rose']);
  assert.equal(h.select('#peGardenNote p').textContent, 'Carinho da flor rose');
  assert.equal(h.all('.pe-flower')[0].getAttribute('aria-pressed'), 'true');
  assert.equal(h.select('.pe-stat-flowers').textContent, '01'); h.api.dispose();
});
test('the five garden species have distinct lightweight native botanical drawings', async () => {
  const h = harness(); await h.flush(); await h.api.open();
  const drawings = h.all('.pe-flower-art').map(item => item.innerHTML);
  assert.equal(new Set(drawings).size, 5);
  for (const drawing of drawings) { assert.match(drawing, /class="pe-stem"/); assert.match(drawing, /class="pe-petals"/); assert.doesNotMatch(drawing, /<image|<script|http/); }
  assert.match(drawings[1], /<ellipse/); assert.match(drawings[3], /rx="3" ry="4.5"/); h.api.dispose();
});
test('three special stars reveal a persistent constellation without triggering the finale', async () => {
  const h = harness(); await h.flush(); await h.api.open();
  for (const index of [0, 1, 2]) h.click(h.all('.pe-star')[index]); await h.flush();
  assert.ok(h.state.discoveries.includes('constellation')); assert.equal(h.select('.pe-sky').classList.contains('pe-connected'), true);
  assert.equal(h.select('.pe-sky-note').textContent, h.state.config.messages.constellation);
  assert.equal(h.select('#papoEventLetter'), null); h.api.dispose();
});
test('effects are bounded, optional and removed on preference changes', async () => {
  const h = harness(); await h.flush();
  const heart = h.select('#papoEventHeart'); for (let i = 0; i < 3; i++) h.click(heart); await h.flush();
  assert.equal(h.all('.pe-falling-petal').length, 18); assert.equal(h.all('.pe-heart-bloom').length, 1);
  for (let i = 0; i < 6; i++) h.click(heart); await h.flush(); assert.equal(h.all('.pe-heart-bloom').length, 1);
  h.preferences({ easterEggs: false }); assert.equal(h.all('.pe-falling-petal').length, 0); assert.equal(heart.hidden, true);
  await h.api.open(); assert.equal(h.all('.pe-star').length, 0); assert.equal(h.all('.pe-special-flower').length, 0);
  assert.match(styles, /\.pe-effects\{[^}]*pointer-events:none/); h.api.dispose();
});
test('trusted monotonic end restores normal HUD even offline and future letters remain inaccessible', async () => {
  const h = harness(); await h.flush(); h.state.endsAt = new Date(Date.parse(h.state.serverNow) + 5000).toISOString(); h.api.applyState(h.state);
  await h.api.open(); h.click(h.all('.pe-envelope')[0]); await h.flush(); assert.ok(h.select('#papoEventLetter'));
  h.offline(); await h.advance(10001);
  assert.equal(h.api.getState().status, 'ended'); assert.equal(h.document.documentElement.classList.contains('papo-event-active'), false);
  assert.equal(h.select('#papoEventNav').hidden, true); assert.equal(h.select('#papoEventLetter'), null); assert.equal(h.all('.pe-envelope').length, 0);
  h.api.dispose(); assert.equal(h.pending.size, 0);
});
test('feature flags, reduced motion, literal private text and cleanup are honored', async () => {
  const h = harness(); await h.flush(); h.state.config.features = { garden: false, letters: false, constellation: false, heart: false, delivery: false, finale: false, decorations: false };
  h.state.config.mainText = '<img src=x onerror=alert(1)>'; h.state.revision++; h.api.applyState(h.state); h.preferences({ reduceMotion: true }); await h.api.open();
  assert.equal(h.select('.pe-story-text').textContent, '<img src=x onerror=alert(1)>'); assert.equal(h.select('.pe-story-text').children.length, 0);
  assert.equal(h.all('.pe-envelope,.pe-garden,.pe-sky,.pe-finale-entry').length, 0); assert.equal(h.select('#papoEventHeart').hidden, true);
  assert.equal(h.document.documentElement.classList.contains('pe-reduced'), true);
  h.api.dispose(); assert.equal(h.pending.size, 0); assert.equal(h.document.listenerCount() + h.window.listenerCount() + h.media.listenerCount(), 0);
  assert.equal(h.all('#papoEventNav,#papoEventPanel,#papoEventLetter,#papoEventEffects').length, 0);
});

test('delivery stops for its message, expires and cancels a delayed message when disabled', async () => {
  const h = harness(); await h.flush(); await h.api.open(); h.click(h.select('#papoEventDeliveryHeart')); await h.flush();
  assert.ok(h.select('.pe-delivery')); assert.equal(h.select('.pe-delivery-message'), null);
  await h.advance(2001); assert.equal(h.select('.pe-delivery-message').textContent, 'Flores para você.');
  await h.advance(6000); assert.equal(h.select('.pe-delivery'), null); assert.equal(h.select('.pe-delivery-message'), null);
  await h.advance(1000); h.click(h.select('#papoEventDeliveryHeart')); await h.flush(); h.preferences({ easterEggs: false });
  await h.advance(2200); assert.equal(h.select('.pe-delivery-message'), null); h.api.dispose();
});
test('the special letter and finale are voluntary, keyboard dismissible and quiet in reduced motion', async () => {
  const h = harness(); await h.flush(); h.preferences({ reduceMotion: true }); await h.api.open();
  h.click(h.select('.pe-special-flower')); await h.flush(); assert.equal(h.select('.pe-letter-body').textContent, 'Um jardim inteiro.');
  assert.equal(h.all('.pe-falling-petal').length, 0); h.key('Escape'); assert.equal(h.select('#papoEventLetter'), null);
  assert.equal(h.select('[data-pe-action="finale"]').disabled, true); h.state.finaleAvailable = true; h.state.revision++; h.api.applyState(h.state);
  assert.equal(h.select('#papoEventLetter'), null); h.click(h.select('[data-pe-action="finale"]'));
  assert.equal(h.select('.pe-letter-body').textContent, 'A história continua.'); assert.equal(h.select('.pe-final-van').src, '/kombi-flowers.svg#still');
  assert.equal(h.all('.pe-final-flower').length, 3); h.key('Escape'); h.api.dispose();
});
