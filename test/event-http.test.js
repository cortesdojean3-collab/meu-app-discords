const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const DAY = 86400000;

test('HTTP event routes enforce session, admin, origin, trusted daily release, safe bootstrap and durable edits', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'papo-event-http-'));
  const file = path.join(dir, 'data.json');
  const probe = net.createServer(); await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`, owner = crypto.randomUUID(), guest = crypto.randomUUID();
  const ownerToken = 'owner-test-token', guestToken = 'guest-test-token';
  const ownerCookie = `papo_sid=${ownerToken}`, guestCookie = `papo_sid=${guestToken}`;
  const salt = crypto.randomBytes(16).toString('hex'), hash = crypto.scryptSync('fixture-password', salt, 64).toString('hex');
  const initial = { users: { owner: { uid: owner, name: 'owner', salt, hash }, guest: { uid: guest, name: 'guest', salt, hash } }, profiles: { [owner]: { name: 'owner' }, [guest]: { name: 'guest' } }, sessions: {}, msgs: {} };
  for (const [token, uid] of [[ownerToken, owner], [guestToken, guest]]) initial.sessions[crypto.createHash('sha256').update(token).digest('hex')] = { uid, remember: true, exp: Date.now() + 20 * DAY, ts: Date.now(), ua: 'event-http-fixture' };
  await fs.writeFile(file, JSON.stringify(initial));
  const midnight = Math.floor(Date.now() / DAY) * DAY;
  const startsAt = new Date(midnight - DAY).toISOString(), endsAt = new Date(midnight + 30 * DAY).toISOString();
  const env = { ...process.env, NODE_ENV: 'test', RENDER: 'false', RENDER_GIT_COMMIT: 'event-http-fixture', PORT: String(port), DATA_FILE: file, INVITE_CODE: '', PAPO_EVENT_ADMIN_USER: 'owner', PAPO_EVENT_START: startsAt, PAPO_EVENT_END: endsAt, PAPO_EVENT_TIME_ZONE: 'UTC' };
  delete env.DATABASE_URL; delete env.LEGACY_DATA_FILE; delete env.EVENT_DATA_FILE; delete env.PAPO_EVENT_ADMIN_UIDS; delete env.PAPO_EVENT_MEETING_DATE;
  let child;
  const stop = async () => { if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; } };
  t.after(async () => { await stop(); assert.equal(path.dirname(dir), os.tmpdir()); assert.ok(path.basename(dir).startsWith('papo-event-http-')); await fs.rm(dir, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: process.env.PAPO_TEST_LOG ? 'inherit' : 'ignore' });
    for (let attempt = 0; attempt < 70; attempt++) {
      if (child.exitCode !== null) throw new Error('Event backend exited before readiness.');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Event backend did not become ready.');
  };
  const request = (route, method = 'GET', body, cookie = ownerCookie, extra = {}) => fetch(base + route, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  await start();
  assert.equal((await request('/api/event', 'GET', undefined, '')).status, 401);
  assert.equal((await request('/api/event/admin', 'GET', undefined, guestCookie)).status, 403);
  const initialState = await (await request('/api/event', 'GET', undefined, guestCookie)).json();
  assert.equal(initialState.status, 'active'); assert.equal(initialState.canAdmin, false); assert.equal(initialState.lettersReleased, 2);
  assert.equal(initialState.config.letters[2].text, undefined);
  assert.equal((await request('/api/event/letter/30?now=2040-01-01', 'GET', undefined, guestCookie, { Date: 'Sun, 1 Jan 2040 12:00:00 GMT' })).status, 403);
  assert.equal((await request('/api/event/letter/1', 'GET', undefined, guestCookie)).status, 200);
  assert.equal((await request('/api/event/discover', 'POST', { kind: 'flower-rose' }, guestCookie, { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await request('/api/event/discover', 'POST', { kind: 'not-a-flower' }, guestCookie)).status, 403);
  const discovery = await (await request('/api/event/discover', 'POST', { kind: 'flower-rose' }, guestCookie)).json();
  assert.deepEqual(discovery.discoveries, ['flower-rose']);
  const admin = await (await request('/api/event/admin')).json();
  const patch = { revision: admin.revision, config: { title: '</script><script>bad()</script>', names: { partner: 'Private test name' }, meetingDate: '2023-10-10' } };
  assert.equal((await request('/api/event/admin', 'PUT', patch, guestCookie)).status, 403);
  assert.equal((await request('/api/event/admin', 'PUT', patch, ownerCookie, { Origin: 'https://attacker.invalid' })).status, 403);
  const updatedResponse = await request('/api/event/admin', 'PUT', patch);
  assert.equal(updatedResponse.status, 200); const updated = await updatedResponse.json();
  assert.equal(updated.revision, admin.revision + 1);
  assert.equal((await request('/api/event/admin', 'PUT', patch)).status, 409);
  assert.equal((await request('/api/event/admin', 'POST', {})).status, 405);
  const malformed = await fetch(base + '/api/event/admin', { method: 'PUT', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(malformed.status, 400);
  const privatePublic = await (await request('/api/event', 'GET', undefined, guestCookie)).text();
  assert.equal(privatePublic.includes('Private test name'), false); assert.equal(privatePublic.includes('2023-10-10'), false);
  for (const route of ['/app', '/', '/app.html', '/index.html']) {
    const html = await (await fetch(base + route)).text();
    assert.equal(html.includes('__PAPO_EVENT_BOOTSTRAP__'), false);
    assert.equal(html.includes('</script><script>bad()'), false);
    assert.equal(html.includes('\\u003c/script>'), true);
    assert.equal(html.includes('Private test name'), false);
    assert.equal(html.includes('Este envelope'), false);
  }
  await stop(); await start();
  const restarted = await (await request('/api/event', 'GET', undefined, guestCookie)).json();
  assert.equal(restarted.config.title, patch.config.title); assert.equal(restarted.revision, updated.revision);
  assert.deepEqual(restarted.discoveries, ['flower-rose']); assert.equal(restarted.startsAt, startsAt);
  assert.equal((await request('/api/me', 'GET', undefined, guestCookie)).status, 200);
  const login = await request('/api/login', 'POST', { user: 'guest', pass: 'fixture-password', remember: true }, '');
  assert.equal(login.status, 200); assert.equal((await login.json()).uid, guest);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.users.owner.uid, owner); assert.equal(saved.users.guest.uid, guest);
  const disabled = await request('/api/event/admin', 'PUT', { revision: updated.revision, config: { enabled: false } });
  assert.equal(disabled.status, 200);
  assert.equal((await request('/api/event/discover', 'POST', { kind: 'heart' }, guestCookie)).status, 403);
  assert.equal((await request('/api/event/letter/1', 'GET', undefined, guestCookie)).status, 403);
});
