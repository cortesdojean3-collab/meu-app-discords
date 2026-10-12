const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/papo-surprises.js'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '../public/papo-surprises.css'), 'utf8');

function events() {
  const handlers = new Map();
  return {
    addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
    removeEventListener(type, fn) { handlers.get(type)?.delete(fn); },
    dispatchEvent(event) { event.target ||= this; for (const fn of [...handlers.get(event.type) || []]) fn(event); },
    listenerCount: () => [...handlers.values()].reduce((n, set) => n + set.size, 0)
  };
}

function harness(preferences = {}, systemMotion = false) {
  let now = 100, sequence = 0;
  const pending = new Map(), storage = new Map([['papo.extras.v1', JSON.stringify(preferences)]]);
  let document;
  function matches(node, selector) {
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
    if (selector.startsWith('[')) {
      const [, attribute, value] = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/) || [];
      return value === undefined ? node.getAttribute(attribute) !== null : node.getAttribute(attribute) === value;
    }
    return node.tagName.toLowerCase() === selector;
  }
  function query(root, selector) {
    const result = [], options = selector.split(',').map(s => s.trim());
    function visit(node) {
      for (const child of node.children) {
        if (options.some(option => {
          const terms = option.split(/\s+/), last = terms.pop();
          if (!matches(child, last)) return false;
          let parent = child.parentNode;
          while (terms.length && parent) { if (matches(parent, terms[terms.length - 1])) terms.pop(); parent = parent.parentNode; }
          return !terms.length;
        })) result.push(child);
        visit(child);
      }
    }
    visit(root); return result;
  }
  function element(tagName = 'div') {
    const classes = new Set(), attributes = new Map();
    const node = Object.assign(events(), {
      tagName: tagName.toUpperCase(), children: [], parentNode: null, dataset: {}, hidden: false, disabled: false,
      id: '', textContent: '', src: '', style: { setProperty(key, value) { this[key] = value; } },
      classList: {
        contains: value => classes.has(value), add: value => classes.add(value),
        toggle(value, force) { const add = force === undefined ? !classes.has(value) : force; if (add) classes.add(value); else classes.delete(value); return add; }
      },
      setAttribute(key, value) { attributes.set(key, String(value)); if (key === 'id') this.id = String(value); },
      getAttribute(key) { if (key === 'data-papo-surprise') return this.dataset.papoSurprise ?? null; return attributes.get(key) ?? null; },
      append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } },
      insertBefore(child, before) { child.parentNode = this; this.children.splice(this.children.indexOf(before), 0, child); },
      replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); },
      remove() { if (!this.parentNode) return; const siblings = this.parentNode.children; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null; },
      contains(other) { for (let cursor = other; cursor; cursor = cursor.parentNode) if (cursor === this) return true; return false; },
      closest(selector) { for (let cursor = this; cursor; cursor = cursor.parentNode) if (selector.split(',').some(s => matches(cursor, s))) return cursor; return null; },
      querySelector(selector) { return query(this, selector)[0] || null; }, querySelectorAll(selector) { return query(this, selector); },
      getBoundingClientRect: () => ({ left: 160, top: 400, width: 28, height: 28 }),
      focus() { document.activeElement = this; }
    });
    Object.defineProperty(node, 'className', {
      get: () => [...classes].join(' '), set: value => { classes.clear(); for (const name of value.split(/\s+/).filter(Boolean)) classes.add(name); }
    });
    Object.defineProperty(node, 'isConnected', { get: () => document.body.contains(node) });
    Object.defineProperty(node, 'innerHTML', { set(value) {
      this.replaceChildren();
      for (const [, tag, raw] of value.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
        const child = element(tag);
        for (const [, name, attribute] of raw.matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/gi)) {
          if (name === 'class') child.className = attribute; else child.setAttribute(name, attribute);
        }
        this.append(child);
      }
    } });
    return node;
  }
  const body = element('body');
  document = Object.assign(events(), { body, readyState: 'complete', hidden: false, activeElement: null,
    createElement: element, querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector) });
  const side = element('aside'); side.id = 'side';
  const me = element(); me.id = 'me'; side.append(me); body.append(side);
  const logo = element('button'); logo.id = 'papoLogoSecret'; body.append(logo);
  const input = element('textarea'); body.append(input);
  const window = events(), media = Object.assign(events(), { matches: systemMotion });
  const context = vm.createContext({ window, document, matchMedia: () => media,
    innerWidth: 1280, innerHeight: 720,
    Date: class extends Date { static now() { return now; } },
    localStorage: { getItem: key => storage.get(key) ?? null },
    setTimeout(fn, delay) { const id = ++sequence; pending.set(id, { at: now + delay, fn }); return id; },
    clearTimeout: id => pending.delete(id)
  });
  function run() { vm.runInContext(source, context); }
  run();
  return { window, document, input, logo, media, pending, storage, run,
    api: window.PapoSurprises,
    select: selector => document.querySelector(selector), count: selector => document.querySelectorAll(selector).length,
    preferences(detail) { document.dispatchEvent({ type: 'papo:preferences-changed', detail }); },
    click(target) { document.dispatchEvent({ type: 'click', target }); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...pending].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; pending.delete(next[0]); next[1].fn();
      }
      now = end;
    }
  };
}

test('turning Easter eggs off aborts effects, delayed delivery messages and open gardens', () => {
  const h = harness();
  assert.equal(h.api.delivery(), true);
  assert.equal(h.api.petals(), true);
  assert.equal(h.api.garden(h.logo), true);
  assert.ok(h.pending.size > 0);
  h.preferences({ easterEggs: false });
  assert.equal(h.pending.size, 0);
  assert.equal(h.count('#papoSurprisesEffects,#papoSurpriseMessage,#papoSecretGarden'), 0);
  assert.equal(h.select('#papoSecretCorner').hidden, true);
  h.advance(10000);
  assert.equal(h.count('#papoSurpriseMessage'), 0);
  assert.equal(h.api.flower(), false);
  assert.equal(h.api.delivery(), false);
  h.preferences({ easterEggs: true });
  assert.equal(h.api.flower(), true);
});

test('reduced motion presents a still delivery and suppresses falling petals', () => {
  for (const options of [{ preferences: { reduceMotion: true } }, { preferences: {}, os: true }]) {
    const h = harness(options.preferences, options.os);
    assert.equal(h.api.delivery(), true);
    assert.equal(h.select('.papo-surprise-delivery img').src, '/kombi-flowers.svg#still');
    assert.equal(h.select('#papoSurprisesEffects').classList.contains('papo-surprises-still'), true);
    assert.equal(h.count('#papoSurpriseMessage'), 1);
    assert.equal(h.api.petals(), true);
    assert.equal(h.count('.papo-surprise-petal'), 0);
    h.advance(5000);
    assert.equal(h.count('.papo-surprise-delivery,#papoSurpriseMessage'), 0);
  }
});

test('effects expire, rapid duplicate effects are bounded, and typing is not intercepted', () => {
  const h = harness();
  assert.equal(h.api.petals(), true);
  assert.equal(h.api.petals(), false);
  h.advance(1000);
  assert.equal(h.api.petals(), false);
  assert.equal(h.count('.papo-surprise-petal'), 18);
  h.input.focus(); h.click(h.input);
  assert.equal(h.document.activeElement, h.input);
  assert.equal(h.count('.papo-surprise-petal'), 18);
  h.advance(5000);
  assert.equal(h.count('.papo-surprise-petal,#papoSurpriseMessage'), 0);
  assert.match(styles, /#papoSurprisesEffects\{[^}]*pointer-events:none/);
});

test('garden supports bounded planting, leaves outside Escape alone, and restores launch focus', () => {
  const h = harness();
  h.logo.focus(); h.api.garden(h.logo);
  const garden = h.select('#papoSecretGarden');
  assert.equal(garden.getAttribute('aria-modal'), 'false');
  const plot = garden.querySelector('.papo-garden-plot');
  for (let i = 0; i < 6; i++) plot.dispatchEvent({ type: 'click' });
  assert.equal(garden.querySelector('.papo-garden-sprouts').children.length, 6);
  plot.dispatchEvent({ type: 'click' });
  assert.equal(garden.querySelector('.papo-garden-sprouts').children.length, 1);
  let prevented = 0;
  h.input.focus(); h.document.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(h.count('#papoSecretGarden'), 1); assert.equal(prevented, 0);
  plot.focus(); h.document.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(h.count('#papoSecretGarden'), 0); assert.equal(prevented, 1);
  assert.equal(h.document.activeElement, h.logo);
});

test('script mounting is idempotent and dispose removes timers, nodes and listeners', () => {
  const h = harness();
  const before = h.document.listenerCount() + h.window.listenerCount() + h.media.listenerCount();
  h.run();
  assert.equal(h.count('#papoSecretCorner'), 1);
  assert.equal(h.document.listenerCount() + h.window.listenerCount() + h.media.listenerCount(), before);
  h.api.flower(); h.api.garden(h.logo); h.api.dispose();
  assert.equal(h.pending.size, 0);
  assert.equal(h.count('#papoSecretCorner,#papoSurprisesEffects,#papoSecretGarden,#papoSurpriseMessage'), 0);
  assert.equal(h.document.listenerCount() + h.window.listenerCount() + h.media.listenerCount(), 0);
  assert.equal(h.window.PapoSurprises, undefined);
});

test('explicit preference changes override saved values and extras acts as a master switch', () => {
  const h = harness({ easterEggs: false });
  assert.equal(h.api.flower(), false);
  h.preferences({ easterEggs: true });
  assert.equal(h.api.flower(), true);
  h.preferences({ easterEggs: true, extras: false });
  assert.equal(h.api.garden(), false);
  assert.equal(h.pending.size, 0);
});
