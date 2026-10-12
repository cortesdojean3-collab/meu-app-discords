const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const turnSecret = 'test-only-turn-secret';
let child, base, tempDir, serverEnv;

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function saveProfileOverSocket(cookie, profile) {
  return new Promise((resolve,reject) => {
    const socket = new WebSocket(base.replace(/^http/,'ws')+'/ws',{headers:{Cookie:cookie,Origin:base}});
    const timer=setTimeout(()=>{socket.close();reject(new Error('profile persistence acknowledgement timed out'))},5000);
    socket.on('open',()=>socket.send(JSON.stringify({t:'sub',c:'profiles'})));
    socket.on('message',raw=>{
      const message=JSON.parse(raw.toString());
      if(message.t==='hist'&&message.c==='profiles')socket.send(JSON.stringify({t:'set',c:'profiles',d:profile,rid:'profile-test'}));
      if(message.t==='ack'&&message.rid==='profile-test'){clearTimeout(timer);socket.close();message.ok?resolve():reject(new Error(message.erro))}
    });
    socket.on('error',error=>{clearTimeout(timer);reject(error)});
  });
}

function readProfileOverSocket(cookie, uid) {
  return new Promise((resolve,reject) => {
    const socket=new WebSocket(base.replace(/^http/,'ws')+'/ws',{headers:{Cookie:cookie,Origin:base}});
    const timer=setTimeout(()=>{socket.close();reject(new Error('profile history timed out'))},5000);
    socket.on('open',()=>socket.send(JSON.stringify({t:'sub',c:'profiles'})));
    socket.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.t==='hist'&&message.c==='profiles'){clearTimeout(timer);socket.close();resolve(message.items.find(item=>item.id===uid)?.d)}});
    socket.on('error',error=>{clearTimeout(timer);reject(error)});
  });
}

function saveMessageOverSocket(cookie, text) {
  return new Promise((resolve,reject) => {
    const socket=new WebSocket(base.replace(/^http/,'ws')+'/ws',{headers:{Cookie:cookie,Origin:base}});
    const timer=setTimeout(()=>{socket.close();reject(new Error('message persistence acknowledgement timed out'))},5000);
    socket.on('open',()=>socket.send(JSON.stringify({t:'sub',c:'msgs-geral'})));
    socket.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.t==='hist'&&message.c==='msgs-geral')socket.send(JSON.stringify({t:'add',c:'msgs-geral',d:{text,cid:crypto.randomUUID()}}));if(message.t==='doc'&&message.c==='msgs-geral'&&message.d?.text===text){clearTimeout(timer);socket.close();resolve(message.id)}});
    socket.on('error',error=>{clearTimeout(timer);reject(error)});
  });
}

function readMessageOverSocket(cookie, id) {
  return new Promise((resolve,reject) => {
    const socket=new WebSocket(base.replace(/^http/,'ws')+'/ws',{headers:{Cookie:cookie,Origin:base}});
    const timer=setTimeout(()=>{socket.close();reject(new Error('message history timed out'))},5000);
    socket.on('open',()=>socket.send(JSON.stringify({t:'sub',c:'msgs-geral'})));
    socket.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.t==='hist'&&message.c==='msgs-geral'){clearTimeout(timer);socket.close();resolve(message.items.find(item=>item.id===id)?.d)}});
    socket.on('error',error=>{clearTimeout(timer);reject(error)});
  });
}

before(async () => {
  const port = await freePort();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papo-server-test-'));
  base = `http://127.0.0.1:${port}`;
  serverEnv = { ...process.env, NODE_ENV:'test',RENDER:'false',PORT: String(port), DATA_FILE: path.join(tempDir, 'data.json'), TURN_URLS: 'turn:relay.example.invalid:3478?transport=udp', TURN_SECRET: turnSecret, INVITE_CODE: '' };
  delete serverEnv.DATABASE_URL;
  child = spawn(process.execPath, ['server.js'], { cwd: root, env: serverEnv, stdio: process.env.PAPO_TEST_LOG ? 'inherit' : 'ignore' });
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

test('intro stylesheet is served as CSS so nosniff does not block the opening animation', async () => {
  const response = await fetch(`${base}/papo-intro.css`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/css\b/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await response.text(), /@keyframes papo-drive/);
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

test('accounts and password hashes survive a backend restart', async () => {
  const username = `persist-${crypto.randomBytes(5).toString('hex')}`;
  const password = 'test-password-123';
  const registration = await fetch(`${base}/api/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user:username,pass:password}) });
  assert.equal(registration.status, 200);
  const first = await registration.json();
  const cookieLine = registration.headers.getSetCookie?.()[0] || registration.headers.get('set-cookie');
  const cookie = cookieLine.split(';',1)[0];
  const profile={name:'Teste persistente',status:'online',bio:'Perfil recuperado depois da reinicialização',color:'#7c3aed',avatar:''};
  await saveProfileOverSocket(cookie,profile);
  const messageId=await saveMessageOverSocket(cookie,`mensagem-${crypto.randomUUID()}`);
  const dbPath = serverEnv.DATA_FILE;
  const saved = JSON.parse(await fs.promises.readFile(dbPath,'utf8'));
  assert.ok(saved.users[username].hash);
  assert.notEqual(saved.users[username].hash, password);

  child.kill();
  await new Promise(resolve => child.once('exit', resolve));
  const port = Number(new URL(base).port);
  child = spawn(process.execPath, ['server.js'], { cwd:root, env:serverEnv, stdio:process.env.PAPO_TEST_LOG ? 'inherit' : 'ignore' });
  let ready = false;
  for (let attempt=0;attempt<60;attempt++) {
    try { if ((await fetch(`${base}/health`)).ok) { ready=true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve,100));
  }
  assert.equal(ready,true,'server should restart with the same persistent store');
  const login = await fetch(`${base}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user:username,pass:password}) });
  assert.equal(login.status,200);
  assert.equal((await login.json()).uid,first.uid);
  const resumed = await fetch(`${base}/api/me`, { headers:{Cookie:cookie} });
  assert.equal(resumed.status,200);
  assert.equal((await resumed.json()).uid,first.uid);
  const loginCookieLine=login.headers.getSetCookie?.()[0]||login.headers.get('set-cookie');
  const persistedProfile=await readProfileOverSocket(loginCookieLine.split(';',1)[0],first.uid);
  assert.equal(persistedProfile.bio,profile.bio);
  const persistedMessage=await readMessageOverSocket(loginCookieLine.split(';',1)[0],messageId);
  assert.equal(persistedMessage.by,first.uid);
});
