const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const root = path.resolve(__dirname, '..');
const turnSecret = 'test-only-turn-secret';
let child, base, tempDir;

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

before(async () => {
  const port = await freePort();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papo-server-test-'));
  base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'data.json'), TURN_URLS: 'turn:relay.example.invalid:3478?transport=udp', TURN_SECRET: turnSecret, INVITE_CODE: '' };
  delete env.DATABASE_URL;
  child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: 'ignore' });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`server.js exited with ${child.exitCode}`);
    try { const response = await fetch(`${base}/health`); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'server should start for integration checks');
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2500))]);
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('version endpoint returns a cacheable build identity', async () => {
  const response = await fetch(`${base}/api/version`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.version, /^\d+\.\d+\.\d+/);
  assert.match(body.build, /^[a-f0-9]{12}$/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('app page embeds the same build identity without a stale placeholder', async () => {
  const [versionResponse, appResponse] = await Promise.all([fetch(`${base}/api/version`), fetch(`${base}/app`)]);
  const version = await versionResponse.json();
  const html = await appResponse.text();
  assert.equal(appResponse.headers.get('cache-control'), 'no-store');
  assert.ok(html.includes(`content="${version.build}"`));
  assert.ok(!html.includes('__PAPO_BUILD_ID__'));
});

test('ICE endpoint gives no TURN credentials to anonymous visitors', async () => {
  const response = await fetch(`${base}/ice`);
  const servers = await response.json();
  assert.equal(response.status, 200);
  assert.equal(servers.length, 1);
  assert.match(servers[0].urls[0], /^stun:/);
});

test('authenticated ICE endpoint mints short-lived TURN credentials', async () => {
  const username = `test-${crypto.randomBytes(5).toString('hex')}`;
  const created = await fetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: username, pass: 'test-password-123' }) });
  assert.equal(created.status, 200);
  const cookieLine = created.headers.getSetCookie?.()[0] || created.headers.get('set-cookie');
  const cookie = cookieLine.split(';', 1)[0];
  const response = await fetch(`${base}/ice`, { headers: { Cookie: cookie, Origin: base } });
  const servers = await response.json();
  assert.equal(servers.length, 2);
  const turn = servers[1];
  assert.deepEqual(turn.urls, ['turn:relay.example.invalid:3478?transport=udp']);
  const expires = Number(turn.username.split(':', 1)[0]);
  assert.ok(expires > Math.floor(Date.now() / 1000));
  assert.ok(expires <= Math.floor(Date.now() / 1000) + 3601);
  const expected = crypto.createHmac('sha1', turnSecret).update(turn.username).digest('base64');
  assert.equal(turn.credential, expected);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('ICE endpoint rejects cross-origin credential requests', async () => {
  const response = await fetch(`${base}/ice`, { headers: { Origin: 'https://attacker.example' } });
  assert.equal(response.status, 403);
});
