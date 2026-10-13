const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, normalizeConfig, publicState, localDate, startOfDate, calendarDates, discoveryAllowed, bootstrap } = require('../event-state');
const configured = (patch = {}) => normalizeConfig({ enabled: true, startsAt: '2026-10-10T00:00:00-03:00', endsAt: '2026-11-10T00:00:00-03:00', ...patch });
const at = date => Date.parse(date);

test('event remains unconfigured until real dates are saved, preserves defaults and 30 distinct letters', () => {
  const config = defaults(), state = publicState(config, { now: at('2026-10-12T12:00:00Z') });
  assert.equal(state.status, 'unconfigured'); assert.equal(state.active, false);
  assert.equal(state.config.letters.length, 30); assert.equal(state.lettersReleased, 0);
  assert.equal(new Set(config.letters.map(letter => letter.text)).size, 30);
  assert.equal(state.config.letters.every(letter => !Object.hasOwn(letter, 'text')), true);
  assert.equal(state.startsAt, null); assert.equal(state.config.meetingDate, undefined);
  assert.equal(state.config.names, undefined);
});

test('activation and automatic closing use exact half-open server-time bounds', () => {
  const config = configured();
  assert.equal(publicState(config, { now: at(config.startsAt) - 1 }).status, 'upcoming');
  const first = publicState(config, { now: at(config.startsAt) });
  assert.equal(first.status, 'active'); assert.equal(first.day, 1); assert.equal(first.daysRemaining, 31);
  assert.equal(first.lettersReleased, 1); assert.equal(first.finaleAvailable, false);
  const last = publicState(config, { now: at(config.endsAt) - 1 });
  assert.equal(last.day, 31); assert.equal(last.daysRemaining, 1); assert.equal(last.lettersReleased, 30);
  assert.equal(last.finaleAvailable, true);
  const ended = publicState(config, { now: at(config.endsAt) });
  assert.equal(ended.status, 'ended'); assert.equal(ended.active, false); assert.equal(ended.daysRemaining, 0);
  assert.equal(ended.lettersReleased, 0); assert.equal(ended.finaleAvailable, false);
  assert.equal(discoveryAllowed('flower-rose', ended), false);
});

test('daily envelopes follow local calendar dates and do not reveal future text', () => {
  const config = configured(), beforeMidnight = publicState(config, { now: at('2026-10-13T02:59:59.999Z') });
  assert.equal(beforeMidnight.lettersReleased, 3);
  assert.equal(beforeMidnight.config.letters[3].availableAt, '2026-10-13T03:00:00.000Z');
  assert.equal(Object.hasOwn(beforeMidnight.config.letters[3], 'text'), false);
  const afterMidnight = publicState(config, { now: at('2026-10-13T03:00:00Z') });
  assert.equal(afterMidnight.lettersReleased, 4); assert.equal(afterMidnight.config.letters[3].text, config.letters[3].text);
  assert.equal(calendarDates(config), 31);
});

test('daylight saving fall-back releases at local midnight instead of adding 24 hours', () => {
  const config = configured({ timeZone: 'America/New_York', startsAt: '2026-10-15T00:00:00-04:00', endsAt: '2026-11-15T00:00:00-05:00' });
  const state = publicState(config, { now: at('2026-11-02T04:59:59Z') });
  assert.equal(state.config.letters[18].availableAt, '2026-11-02T05:00:00.000Z');
  assert.equal(state.lettersReleased, 18);
  assert.equal(publicState(config, { now: at('2026-11-02T05:00:00Z') }).lettersReleased, 19);
});

test('daylight saving spring-forward and skipped midnight retain one calendar release per day', () => {
  const config = configured({ timeZone: 'America/New_York', startsAt: '2026-03-01T00:00:00-05:00', endsAt: '2026-04-01T00:00:00-04:00' });
  const state = publicState(config, { now: at('2026-03-09T04:00:00Z') });
  assert.equal(state.lettersReleased, 9); assert.equal(state.config.letters[8].availableAt, '2026-03-09T04:00:00.000Z');
  assert.equal(new Date(startOfDate('2018-11-04', 'America/Sao_Paulo')).toISOString(), '2018-11-04T03:00:00.000Z');
  assert.equal(localDate('2018-11-04T02:59:59Z', 'America/Sao_Paulo'), '2018-11-03');
});

test('optional names and original meeting date are private until explicitly published', () => {
  const config = configured({ names: { you: 'Apelido privado', partner: 'Nome privado' }, meetingDate: '2023-10-10' });
  const privateState = publicState(config, { now: at('2026-10-12T12:00:00Z') });
  assert.equal(JSON.stringify(privateState).includes('Nome privado'), false);
  assert.equal(privateState.config.meetingDate, undefined); assert.equal(privateState.daysSinceMeeting, undefined);
  const published = publicState(normalizeConfig({ publishNames: true, publishMeetingDate: true }, config), { now: at('2026-10-12T12:00:00Z') });
  assert.equal(published.config.names.partner, 'Nome privado'); assert.equal(published.config.meetingDate, '2023-10-10');
  assert.equal(published.daysSinceMeeting, 1098);
  const opening = bootstrap(published);
  assert.equal(opening.active, true); assert.equal(opening.names, undefined); assert.equal(opening.meetingDate, undefined); assert.equal(opening.letters, undefined);
});

test('memories and each surprise require an explicit setting', () => {
  const config = configured({ features: { garden: false, heart: false, letters: false } });
  const state = publicState(config, { now: at('2026-10-12T12:00:00Z') });
  assert.equal(discoveryAllowed('flower-rose', state), false); assert.equal(discoveryAllowed('heart', state), false);
  assert.equal(discoveryAllowed('delivery', state), true); assert.equal(discoveryAllowed('anything', state), false);
  assert.equal(state.lettersReleased, 0);
  const remembered = publicState(configured({ allowMemories: true }), { now: at('2026-11-10T03:00:00Z') });
  assert.equal(remembered.status, 'ended'); assert.equal(remembered.active, false); assert.equal(remembered.lettersReleased, 30);
  assert.equal(remembered.finaleAvailable, true);
});

test('invalid dates, insufficient calendar days, zone, colors, flags and texts are rejected', () => {
  for (const patch of [
    { startsAt: '2026-02-30T00:00:00-03:00' }, { startsAt: '2026-10-10T00:00' }, { startsAt: '2026-10-10T24:00:00-03:00' },
    { endsAt: '2026-10-09T00:00:00-03:00' }, { endsAt: '2026-10-20T00:00:00-03:00' },
    { timeZone: 'Mars/Garden' }, { colors: { primary: 'red;position:fixed' } },
    { features: { garden: 'true' } }, { title: '' }, { letters: ['only one'] },
    { meetingDate: '2027-01-01' }, { publishNames: 1 }
  ]) assert.throws(() => configured(patch));
  assert.throws(() => normalizeConfig({ enabled: true }), /Configure início/);
  assert.throws(() => normalizeConfig({ startsAt: '2026-10-10T00:00:00-03:00' }), /duas datas/);
});
