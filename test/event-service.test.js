const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createEventService } = require('../event-service');
const { createStorage } = require('../storage');
const owner = crypto.randomUUID(), guest = crypto.randomUUID();
const users = { owner: { uid: owner, name: 'owner' }, guest: { uid: guest, name: 'guest' } };
const seed = { PAPO_EVENT_ADMIN_USER: 'owner', PAPO_EVENT_START: '2026-10-10T00:00:00-03:00', PAPO_EVENT_END: '2026-11-10T00:00:00-03:00', PAPO_EVENT_MEETING_DATE: '2023-10-10' };
const fixedNow = Date.parse('2026-10-12T12:00:00Z');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'papo-event-test-'));
  t.after(async () => { assert.equal(path.dirname(dir), os.tmpdir()); assert.ok(path.basename(dir).startsWith('papo-event-test-')); await fs.rm(dir, { recursive: true, force: true }); });
  return path.join(dir, 'event.json');
}

test('development event data persists separately, immutable admin UID and optimistic revision survive restart', async t => {
  const dataFile = await fixture(t);
  let clock = fixedNow;
  const service = createEventService({ dataFile, users, env: seed, now: () => clock }); await service.initialize();
  assert.equal((await service.state(owner)).canAdmin, true); assert.equal((await service.state(guest)).canAdmin, false);
  assert.equal((await service.state(owner)).status, 'active'); assert.equal((await service.adminState(owner)).revision, 1);
  await assert.rejects(service.adminState(guest), error => error.status === 403);
  await assert.rejects(service.update(guest, { revision: 1, config: { title: 'Malicioso' } }), error => error.status === 403);
  const updated = await service.update(owner, { revision: 1, config: { title: 'Um jardim nosso', names: { partner: 'Segredo' } } });
  assert.equal(updated.revision, 2);
  await assert.rejects(service.update(owner, { revision: 1, config: { title: 'Edição antiga' } }), error => error.status === 409);
  await service.discover(guest, 'flower-rose'); await service.discover(guest, 'flower-rose');
  assert.deepEqual((await service.state(guest)).discoveries, ['flower-rose']);
  assert.deepEqual((await service.state(owner)).discoveries, []);
  assert.equal((await service.letter(guest, 3)).unlocked, true);
  await assert.rejects(service.letter(guest, 4), error => error.status === 403);
  await service.close();
  const replacedUsers = { owner: { uid: crypto.randomUUID(), name: 'owner' }, guest: users.guest };
  const replacement = createEventService({ dataFile, users: replacedUsers, env: { ...seed, PAPO_EVENT_END: '2026-12-10T00:00:00-03:00' }, now: () => clock }); await replacement.initialize();
  assert.equal(await replacement.canAdmin(replacedUsers.owner.uid), false, 'a recycled username never inherits administration');
  const remembered = await replacement.state(guest);
  assert.equal(remembered.config.title, 'Um jardim nosso'); assert.equal(remembered.revision, 2);
  assert.equal(remembered.endsAt, '2026-11-10T03:00:00.000Z', 'environment seeding never resets edited dates');
  assert.deepEqual(remembered.discoveries, ['flower-rose']); assert.equal(JSON.stringify(remembered).includes('Segredo'), false);
  clock = Date.parse('2026-11-10T03:00:00Z');
  assert.equal((await replacement.state(guest)).status, 'ended');
  await assert.rejects(replacement.discover(guest, 'heart'), error => error.status === 403);
  await replacement.close();
});

test('no first-account claim exists and default data can safely receive a later explicit seed', async t => {
  const dataFile = await fixture(t), first = createEventService({ dataFile, users, env: {}, now: () => fixedNow }); await first.initialize();
  assert.equal(await first.canAdmin(owner), false); assert.equal((await first.state(owner)).status, 'unconfigured'); await first.close();
  const seeded = createEventService({ dataFile, users, env: seed, now: () => fixedNow }); await seeded.initialize();
  assert.equal((await seeded.state(owner)).status, 'active'); assert.equal(await seeded.canAdmin(owner), true);
  assert.equal((await seeded.state(owner)).config.meetingDate, '2023-10-10'); await seeded.close();
});

test('concurrent file edits allow only one revision and corrupt data fails without replacement', async t => {
  const dataFile = await fixture(t), service = createEventService({ dataFile, users, env: seed, now: () => fixedNow }); await service.initialize();
  const results = await Promise.allSettled([
    service.update(owner, { revision: 1, config: { subtitle: 'Primeira edição' } }),
    service.update(owner, { revision: 1, config: { subtitle: 'Segunda edição' } })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409); await service.close();
  await fs.writeFile(dataFile, '{invalid json');
  await assert.rejects(createEventService({ dataFile, users, env: {} }).initialize());
  assert.equal(await fs.readFile(dataFile, 'utf8'), '{invalid json');
});

let PGlite;
try { ({ PGlite } = require(process.env.PAPO_TEST_PGLITE_MODULE || '@electric-sql/pglite')); } catch {}
test('PostgreSQL event schema, config, administrator and discoveries survive overlapping deploys without changing accounts', { skip: !PGlite }, async t => {
  const dataFile = await fixture(t), db = new PGlite(); t.after(() => db.close());
  const query = async (sql, params) => {
    if (/CREATE TABLE/.test(sql)) { await db.exec(sql); return { rows: [], rowCount: 0 }; }
    const result = await db.query(sql, params); return { ...result, rowCount: result.command === 'SELECT' ? result.rows.length : result.affectedRows };
  };
  const pool = { on() {}, query, connect: async () => ({ query, release() {} }), async end() {} };
  const storage = createStorage({ databaseUrl: 'postgres://test@localhost/test', dataFile, production: true, poolFactory: () => pool });
  const accounts = await storage.load();
  accounts.users.owner = { ...users.owner, salt: 'a'.repeat(32), hash: 'b'.repeat(128), createdAt: fixedNow };
  accounts.users.guest = { ...users.guest, salt: 'c'.repeat(32), hash: 'd'.repeat(128), createdAt: fixedNow };
  accounts.sessions.saved = { uid: owner, remember: true, exp: fixedNow + 864000000, ts: fixedNow, ua: 'fixture' };
  await storage.save(accounts);
  const first = createEventService({ pool, users: accounts.users, env: seed, now: () => fixedNow }); await first.initialize();
  assert.equal(await first.canAdmin(owner), true);
  await first.discover(guest, 'special'); await first.discover(guest, 'special');
  const second = createEventService({ pool, users: accounts.users, env: { PAPO_EVENT_ADMIN_USER: 'guest' }, now: () => fixedNow }); await second.initialize();
  assert.equal(await second.canAdmin(owner), true); assert.equal(await second.canAdmin(guest), false);
  const before = await second.adminState(owner);
  const updated = await first.update(owner, { revision: before.revision, config: { mainText: 'Nossa mensagem persistente', allowMemories: true } });
  await assert.rejects(second.update(owner, { revision: before.revision, config: { mainText: 'Edição antiga' } }), error => error.status === 409);
  const current = await second.state(guest);
  assert.equal(current.revision, updated.revision); assert.equal(current.config.mainText, 'Nossa mensagem persistente');
  assert.deepEqual(current.discoveries, ['special']);
  assert.equal((await storage.readUser('owner')).uid, owner);
  assert.equal((await storage.readSession('saved')).uid, owner);
  await query('delete from papo_users where uid=$1', [owner]);
  const recycled = crypto.randomUUID();
  await query('insert into papo_users(user_key,uid,name,salt,password_hash,created_at) values($1,$2,$3,$4,$5,$6)', ['owner', recycled, 'owner', 'a', 'b', fixedNow]);
  const restart = createEventService({ pool, users: { owner: { uid: recycled }, guest: users.guest }, env: seed, now: () => fixedNow }); await restart.initialize();
  assert.equal(await restart.canAdmin(recycled), false);
  assert.equal((await restart.state(guest)).config.mainText, 'Nossa mensagem persistente');
  await first.close(); await second.close(); await restart.close(); await storage.close();
});
