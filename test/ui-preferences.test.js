const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/papo-enhancements.js'), 'utf8');
const lookSource = source.slice(source.indexOf('  function applyLocalLook()'), source.indexOf('  applyLocalLook();'));
function lookHarness(prefs, systemReduced = false) {
  const classes = new Set(), inputs = { '#papoKombiCursor': {}, '#papoCursorSize': {}, '#papoReduceMotion': {} };
  const toggle = (name, active) => active ? classes.add(name) : classes.delete(name);
  const document = { body: { dataset: {}, classList: { toggle } }, documentElement: { dataset: {}, classList: { toggle } } };
  const context = vm.createContext({ prefs, motionPreference: { matches: systemReduced }, document, q: id => inputs[id] });
  vm.runInContext(lookSource + '\napplyLocalLook();', context);
  return { document, classes, inputs, context };
}

test('small cursor preserves the Kombi aspect and medium keeps the original dimensions', () => {
  const small = fs.readFileSync(path.join(__dirname, '../public/kombi-cursor.svg'), 'utf8');
  const medium = fs.readFileSync(path.join(__dirname, '../public/kombi-cursor-medium.svg'), 'utf8');
  assert.match(small, /width="34" height="23" viewBox="0 0 48 32"/);
  assert.equal(small.replace('width="34" height="23"', 'width="48" height="32"'), medium);
  assert.match(source, /kombi-cursor\.svg'\) 6 6/);
  assert.match(source, /kombi-cursor-medium\.svg'\) 8 8/);
});

test('cursor defaults small, can become medium and leaves text inputs to the system', () => {
  const h = lookHarness({ kombi: true });
  assert.equal(h.document.body.dataset.papoCursor, 'small');
  assert.equal(h.inputs['#papoCursorSize'].value, 'small');
  h.context.prefs.cursorSize = 'medium'; vm.runInContext('applyLocalLook()', h.context);
  assert.equal(h.document.body.dataset.papoCursor, 'medium');
  h.context.prefs.kombi = false; vm.runInContext('applyLocalLook()', h.context);
  assert.equal(h.document.body.dataset.papoCursor, 'system');
  assert.equal(h.classes.has('papo-kombi'), false);
  assert.match(source, /body\.papo-kombi input,body\.papo-kombi textarea\{cursor:text\}/);
});

test('system reduced motion wins over a stored false preference and accent values are bounded', () => {
  const h = lookHarness({ kombi: true, reduceMotion: false, accent: 'invalid' }, true);
  assert.ok(h.classes.has('papo-reduce-motion'));
  assert.equal(h.document.documentElement.dataset.papoAccent, 'violet');
  h.context.prefs.accent = 'plum'; vm.runInContext('applyLocalLook()', h.context);
  assert.equal(h.document.documentElement.dataset.papoAccent, 'plum');
});

test('audio badges do not repeatedly rewrite the DOM during observer synchronization', () => {
  const badgeSource = source.slice(source.indexOf('  function updateAudioBadge('), source.indexOf('  function viewProfile('));
  let badge = null, mutations = 0;
  const element = { dataset: { videoTile: '1' }, querySelector: () => badge, append: value => { badge = value; } };
  const context = vm.createContext({
    mutedLocally: kind => kind === 'share',
    document: { createElement: () => ({ setAttribute() {}, _text: '', get textContent() { return this._text; }, set textContent(value) { this._text = value; mutations++; }, title: '' }) }
  });
  vm.runInContext(badgeSource, context); context.element = element;
  vm.runInContext('updateAudioBadge(element,"test-user");updateAudioBadge(element,"test-user");updateAudioBadge(element,"test-user")', context);
  assert.equal(badge.textContent, 'Transmissão silenciada');
  assert.equal(mutations, 1, 'the MutationObserver must reach a stable DOM');
});

test('more options lives inside the stream toolbar and is only mounted once', () => {
  const buttonSource = source.slice(source.indexOf('  function addGiftButton('), source.indexOf('  function syncTargets('));
  let button, mounted = 0;
  const toolbar = { append(value) { button = value; mounted++; } };
  const element = { querySelector(selector) { return selector === '.papo-trigger' ? button : toolbar; }, append() { assert.fail('video actions must use the toolbar'); } };
  const context = vm.createContext({ document: { createElement: () => ({ setAttribute() {}, addEventListener() {} }) } });
  vm.runInContext(buttonSource, context); context.element = element;
  vm.runInContext('addGiftButton(element);addGiftButton(element)', context);
  assert.equal(mounted, 1);
});

test('copy gracefully reports a browser without clipboard access', async () => {
  const copySource = source.slice(source.indexOf('  async function copy('), source.indexOf('  function findPeer('));
  const notes = []; const context = vm.createContext({ navigator: {}, toast: message => notes.push(message) });
  vm.runInContext(copySource, context); await vm.runInContext('copy("convite")', context);
  assert.deepEqual(notes, ['Não consegui copiar neste navegador.']);
});

test('sending a flower does not start music without a separate listening action', () => {
  const giftSource = source.slice(source.indexOf('  function sendGift('), source.indexOf('  function addGiftButton('));
  let music = 0, click, sent;
  const context = vm.createContext({
    prefs: { giftAudio: true }, send: value => { sent = value; }, closeMenu() {}, toast() {},
    startMusic: () => music++, q: () => ({ append() {}, remove() {} }),
    document: { createElement: () => ({ addEventListener: (name, handler) => { click = handler; } }) }
  });
  vm.runInContext(giftSource + '\nsendGift("friend")', context);
  assert.equal(sent.to, 'friend'); assert.equal(music, 0);
  click(); assert.equal(music, 1);
});
