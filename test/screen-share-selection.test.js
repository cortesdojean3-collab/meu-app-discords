'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createScreenShareSelection, SOURCE_OPTIONS } = require('../screen-share-selection');

function source(id, name, thumbnail = 'preview') {
  return { id, name, thumbnail: { toDataURL: () => `data:${thumbnail}` }, appIcon: null };
}

test('selector lists every screen and window returned by Electron with previews and no app-name filtering', async () => {
  const available = [source('screen:0:0', 'Display 1'), source('window:31:0', 'Protected Game.exe'), source('window:32:0', 'Minimized window')];
  const selection = createScreenShareSelection({ desktopCapturer: { getSources: async options => { assert.deepEqual(options, SOURCE_OPTIONS); return available; } }, platform: 'win32' });
  const request = selection.open({}, () => {});
  const result = await request.list();
  assert.equal(result.ok, true);
  assert.deepEqual(result.sources.map(item => item.id), ['screen:0:0', 'window:32:0', 'window:31:0']);
  assert.equal(result.sources[0].thumb, 'data:preview');
  assert.equal(result.sources[0].screen, true);
  assert.equal(result.sources[1].screen, false);
});

test('selection rechecks the chosen source and rejects a closed or stale window without completing the request', async () => {
  let current = [source('window:7:0', 'Editor')], completions = 0;
  const request = createScreenShareSelection({ desktopCapturer: { getSources: async () => current }, platform: 'darwin' }).open({}, () => completions++);
  await request.list();
  current = [];
  const result = await request.choose('window:7:0');
  assert.equal(result.retry, true);
  assert.equal(completions, 0);
  assert.equal(request.active, true);
});

test('cancel denies capture once and a late second action cannot reply again', async () => {
  const replies = [];
  const request = createScreenShareSelection({ desktopCapturer: { getSources: async () => [] } }).open({}, streams => replies.push(streams));
  request.cancel();
  request.cancel();
  assert.deepEqual(replies, [null]);
  assert.equal((await request.choose(null)).ok, false);
});

test('Windows system audio is granted only when requested; other platforms return video only', async () => {
  for (const [platform, audioRequested, expectedAudio] of [['win32', true, 'loopback'], ['darwin', true, undefined], ['win32', false, undefined]]) {
    const display = source('screen:0:0', 'Desktop');
    const replies = [];
    const request = createScreenShareSelection({ desktopCapturer: { getSources: async () => [display] }, platform }).open({ audioRequested }, streams => replies.push(streams));
    await request.list();
    assert.equal((await request.choose(display.id)).ok, true);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].video, display);
    assert.equal(replies[0].audio, expectedAudio);
  }
});

test('source enumeration errors return a retryable state and log diagnostic details', async () => {
  const logs = [];
  const request = createScreenShareSelection({ desktopCapturer: { getSources: async () => { throw new Error('permission denied'); } }, logger: (...args) => logs.push(args) }).open({}, () => {});
  const result = await request.list();
  assert.equal(result.ok, false);
  assert.match(result.error, /atualizar/);
  assert.equal(logs[0][0], 'list');
  assert.match(logs[0][1].message, /permission denied/);
});
