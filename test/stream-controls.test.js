'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../public/app.html'), 'utf8');
const block = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));

class Surface {
  constructor() {
    this.listeners = new Map();
    this.classes = new Set();
    this.dataset = { uid: 'alice' };
    this.panels = [];
    this.hover = false;
    this.keyboardFocus = false;
    this.attributes = {};
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name),
      toggle: (name, on) => { const enabled = on == null ? !this.classes.has(name) : on; enabled ? this.classes.add(name) : this.classes.delete(name); return enabled; }
    };
  }
  addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== fn)); }
  emit(type, event = {}) { (this.listeners.get(type) || []).slice().forEach(fn => fn(event)); }
  matches(selector) { return selector === ':hover' ? this.hover : this.keyboardFocus; }
  contains(target) { return target === this || target?.owner === this; }
  querySelector(selector) {
    if (selector === '.vp.open') return this.panels.find(panel => panel.classList.contains('open')) || null;
    if (selector.startsWith('[aria-controls=')) return this.trigger;
    return null;
  }
  querySelectorAll(selector) { return selector === '.vp.open' ? this.panels.filter(panel => panel.classList.contains('open')) : this.panels; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function controls() {
  const timers = new Map(), document = new Surface(), tile = new Surface(), ui = new Surface();
  let sequence = 0;
  document.activeElement = null;
  const context = vm.createContext({
    document,
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(block('function bindTileControls(', 'function addVolumeControls('), context);
  context.bindTileControls(tile, ui);
  return {
    document, tile, ui, timers,
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(timer => { assert.equal(timer.ms, 2600); timer.fn(); }); }
  };
}

test('stream controls hide after pointer inactivity while video remains hovered, and movement brings them back', () => {
  const { tile, tick } = controls();
  assert.equal(tile.classList.contains('controls-visible'), true);
  tile.hover = true;
  tick();
  assert.equal(tile.classList.contains('controls-visible'), false);
  tile.emit('pointermove');
  assert.equal(tile.classList.contains('controls-visible'), true);
  tick();
  assert.equal(tile.classList.contains('controls-visible'), false);
});

test('using controls or keyboard focus keeps them visible and disposing a tile removes listeners and timers', () => {
  const { document, tile, ui, tick, timers } = controls();
  ui.hover = true;
  tick();
  assert.equal(tile.classList.contains('controls-visible'), true);
  ui.hover = false;
  tile.emit('pointerleave');
  tick();
  assert.equal(tile.classList.contains('controls-visible'), false);
  document.activeElement = { owner: ui };
  tile.emit('focusin');
  tick();
  assert.equal(tile.classList.contains('controls-visible'), true);
  document.activeElement = null;
  tile.emit('focusout');
  tick();
  assert.equal(tile.classList.contains('controls-visible'), false);
  tile.emit('pointermove');
  tile.disposeTileControls();
  assert.equal(timers.size, 0);
  for (const target of [document, tile, ui]) for (const listeners of target.listeners.values()) assert.equal(listeners.length, 0);
});

test('open volume panels prevent auto hide and Escape closes the panel while restoring focus to its button', () => {
  const { document, tile, ui, tick } = controls();
  const panel = new Surface(); panel.id = 'volume-panel-test'; panel.classList.add('open');
  ui.panels.push(panel);
  ui.trigger = new Surface();
  ui.trigger.focus = () => { document.activeElement = { owner: ui }; };
  tile.classList.add('volume-open');
  tick();
  assert.equal(tile.classList.contains('controls-visible'), true);
  let prevented = false;
  tile.emit('keydown', { key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
  assert.equal(panel.classList.contains('open'), false);
  assert.equal(tile.classList.contains('volume-open'), false);
  assert.equal(ui.trigger.attributes['aria-expanded'], 'false');
  assert.equal(document.activeElement.owner, ui);
});

test('participant voice and stream gains are independent, mute preserves volume, and persisted values are clamped', () => {
  const cfg = { pvol: {} }, events = [], gains = {
    a: { uid: 'alice', kind: 'voice', g: { gain: { value: 1 } } },
    b: { uid: 'alice', kind: 'share', g: { gain: { value: 1 } } },
    c: { uid: 'bob', kind: 'share', g: { gain: { value: 1 } } }
  };
  let saves = 0;
  const context = vm.createContext({ cfg, R: gains, saveCfg() { saves++; }, document: { dispatchEvent: event => events.push(event) }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } });
  vm.runInContext(block('const pv=', 'function route('), context);
  context.setParticipantVolume('alice', 'voice', 65, false);
  context.setParticipantVolume('alice', 'share', 140, true);
  assert.equal(gains.a.g.gain.value, .65);
  assert.equal(gains.b.g.gain.value, 0);
  assert.equal(gains.c.g.gain.value, 1);
  assert.equal(cfg.pvol['share:alice'].v, 140);
  context.setParticipantVolume('alice', 'share', 140, false);
  assert.equal(gains.b.g.gain.value, 1.4);
  context.setParticipantVolume('alice', 'share', 900, false);
  assert.equal(gains.b.g.gain.value, 2);
  assert.equal(saves, 4);
  assert.equal(events[3].type, 'papo:participant-volume');
});

test('fullscreen moves from another tile, exits on toggle, and reports rejected requests', async () => {
  const operations = [], errors = [], document = { fullscreenElement: { id: 'other' }, async exitFullscreen() { operations.push('exit'); this.fullscreenElement = null; } };
  const tile = { async requestFullscreen() { operations.push('enter'); document.fullscreenElement = tile; }, showTileControls() { operations.push('show'); } };
  const context = vm.createContext({ document, ban: error => errors.push(error), Error });
  vm.runInContext(block('async function toggleTileFullscreen(', 'function userTile('), context);
  await context.toggleTileFullscreen(tile);
  assert.deepEqual(operations, ['exit', 'enter', 'show']);
  await context.toggleTileFullscreen(tile);
  assert.equal(document.fullscreenElement, null);
  tile.requestFullscreen = async () => { throw new Error('denied'); };
  await context.toggleTileFullscreen(tile);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /tela cheia/);
});

test('muted channels preserve messages and unread counts while suppressing duplicate, sound and browser alerts', () => {
  const store = {}, unread = {}, sounds = [], notices = [];
  const cfg = { muteUntil: 0, mutedChannels: { jogos: true }, notif: true };
  const context = vm.createContext({ store, unread, cfg, myId: 'self', cur: 'geral', userSt: 'online', P: {}, fire() {}, drawChs() {}, chime: kind => sounds.push(kind), pr: () => ({ name: 'Amiga' }), document: { hidden: true }, window: { Notification: true }, Notification: class { static permission = 'granted'; constructor(name, data) { notices.push({ name, data }); } } });
  vm.runInContext(block('function onDoc(', "addEventListener('online'"), context);
  const message = { c: 'msgs-jogos', id: 'one', d: { by: 'alice', text: 'oi' } };
  context.onDoc(message);
  context.onDoc(message);
  assert.equal(store['msgs-jogos'].length, 1);
  assert.equal(unread.jogos, 1);
  assert.equal(sounds.length, 0);
  assert.equal(notices.length, 0);
  cfg.mutedChannels.jogos = false;
  context.onDoc({ ...message, id: 'two' });
  assert.equal(sounds.length, 1);
  assert.equal(notices.length, 1);
  context.userSt = 'busy';
  context.onDoc({ ...message, id: 'three' });
  assert.equal(unread.jogos, 3);
  assert.equal(sounds.length, 1);
  assert.equal(notices.length, 1);
});

test('opening settings lists devices without requesting microphone or camera permission and keeps saved selection', async () => {
  const selects = Object.fromEntries(['sMic', 'sSpk', 'sCam'].map(id => [id, { options: [], append(option) { this.options.push(option); } }]));
  let requests = 0, enumerations = 0;
  const context = vm.createContext({
    navigator: { mediaDevices: { getUserMedia() { requests++; throw new Error('unexpected permission request'); }, async enumerateDevices() { enumerations++; return [{ kind: 'audioinput', deviceId: 'mic-1', label: '' }, { kind: 'videoinput', deviceId: 'camera-1', label: '' }]; } } },
    cfg: { mic: 'saved-mic', spk: '', cam: 'camera-1' }, AC: {}, $: selector => selects[selector.slice(1)],
    Option: class { constructor(text, value) { this.text = text; this.value = value; } }, console
  });
  vm.runInContext(block('async function loadDevs(', 'async function onCfg('), context);
  await context.loadDevs();
  assert.equal(requests, 0);
  assert.equal(enumerations, 1);
  assert.equal(selects.sMic.value, 'saved-mic');
  assert.equal(selects.sMic.options[1].text, 'Microfone 1');
  assert.equal(selects.sCam.options[1].text, 'Câmera 1');
  assert.equal(selects.sSpk.disabled, true);
});
