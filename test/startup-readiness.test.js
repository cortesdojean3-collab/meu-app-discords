const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appHtml = fs.readFileSync(path.resolve(__dirname, '../public/app.html'), 'utf8');
const channelSource = appHtml.match(/const CH=[^\r\n]+/)[0];
const socketSource = appHtml.slice(appHtml.indexOf('function openWs(){'), appHtml.indexOf('function onDoc(m)'));

function socketHarness(channel) {
  const auth = { style: { display: 'grid' } }, app = { inert: true };
  const marks = [], timeline = [];
  const context = vm.createContext({
    ws: null, wsUrl: 'ws://localhost/ws', cur: channel, myPeer: null, pcs: {},
    store: {}, pendingAcks: new Map(),
    $: selector => selector === '#auth' ? auth : selector === '#app' ? app : null,
    window: { PapoStartup: { markReady: outcome => { marks.push(outcome); timeline.push('ready'); } } },
    fire: collection => timeline.push(collection),
    WebSocket: class { constructor(url) { this.url = url; } },
    clearTimeout, setTimeout
  });
  vm.runInContext(`${channelSource}\n${socketSource}\nopenWs();`, context, { filename: 'app-websocket-startup.js' });
  return { context, auth, app, marks, timeline, receive: message => context.ws.onmessage({ data: JSON.stringify(message) }) };
}

test('login after session expiration in a voice channel releases auth after welcome and profiles', () => {
  const h = socketHarness('voz1');
  h.receive({ t: 'welcome', peer: 'new-session' });
  assert.equal(h.auth.style.display, 'grid');
  h.receive({ t: 'hist', c: 'profiles', items: [] });
  assert.equal(h.auth.style.display, 'none', 'voice channels do not have a text history to wait for');
  assert.equal(h.app.inert, false);
  assert.deepEqual(h.marks, ['app']);
  assert.deepEqual(h.timeline, ['profiles', 'ready'], 'profile rendering finishes before startup is released');
  h.receive({ t: 'hist', c: 'msgs-geral', items: [] });
  h.receive({ t: 'hist', c: 'profiles', items: [] });
  assert.deepEqual(h.marks, ['app'], 'late histories do not repeat the ready signal');
});

test('switching text channels before startup completes requires the history of the current channel', () => {
  const h = socketHarness('geral');
  h.receive({ t: 'welcome', peer: 'new-session' });
  h.receive({ t: 'hist', c: 'msgs-geral', items: [] });
  h.context.cur = 'jogos';
  h.receive({ t: 'hist', c: 'profiles', items: [] });
  assert.equal(h.auth.style.display, 'grid');
  assert.equal(h.app.inert, true);
  assert.deepEqual(h.marks, []);
  h.receive({ t: 'hist', c: 'msgs-jogos', items: [] });
  assert.equal(h.auth.style.display, 'none');
  assert.equal(h.app.inert, false);
  assert.deepEqual(h.marks, ['app']);
  assert.equal(h.timeline.at(-2), 'msgs-jogos');
  assert.equal(h.timeline.at(-1), 'ready');
});

test('histories received before welcome still wait for the authenticated WebSocket greeting', () => {
  const h = socketHarness('geral');
  h.receive({ t: 'hist', c: 'profiles', items: [] });
  h.receive({ t: 'hist', c: 'msgs-geral', items: [] });
  assert.equal(h.auth.style.display, 'grid');
  assert.deepEqual(h.marks, []);
  h.receive({ t: 'welcome', peer: 'new-session' });
  assert.equal(h.auth.style.display, 'none');
  assert.deepEqual(h.marks, ['app']);
});
