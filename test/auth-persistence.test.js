const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname,'..');
let child,base,dir,file,env;
const legacyUid=crypto.randomUUID(),expiredToken='expired-test-token';
async function start() {
  child=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:process.env.PAPO_TEST_LOG?'inherit':'ignore'});
  for(let attempt=0;attempt<70;attempt++) {
    if(child.exitCode!==null)throw new Error(`Backend exited with ${child.exitCode}`);
    try{if((await fetch(base+'/health')).ok)return}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Backend did not start');
}
async function stop() {
  if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
}
const request=(route,body,headers={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const cookieOf=response=>response.headers.get('set-cookie').split(';',1)[0];
before(async()=>{
  const probe=net.createServer();await new Promise((resolve,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  dir=await fs.mkdtemp(path.join(os.tmpdir(),'papo-auth-test-'));file=path.join(dir,'data.json');base=`http://127.0.0.1:${port}`;
  const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync('legacy-password',salt,64).toString('hex');
  await fs.writeFile(file,JSON.stringify({users:{legacy:{uid:legacyUid,name:'legacy',salt,hash}},profiles:{[legacyUid]:{name:'legacy'}},msgs:{},sessions:{[crypto.createHash('sha256').update(expiredToken).digest('hex')]:{uid:legacyUid,remember:true,exp:Date.now()-1000,ts:Date.now()-2000,ua:'expired'}}}));
  env={...process.env,NODE_ENV:'test',RENDER:'false',PORT:String(port),DATA_FILE:file,INVITE_CODE:''};delete env.DATABASE_URL;delete env.LEGACY_DATA_FILE;
  await start();
});
after(async()=>{await stop();if(dir){assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('papo-auth-test-'));await fs.rm(dir,{recursive:true,force:true});}});

test('legacy passwords keep the same account and gain a stronger versioned hash on login',async()=>{
  const response=await request('/api/login',{user:'legacy',pass:'legacy-password',remember:true});
  assert.equal(response.status,200);assert.equal((await response.json()).uid,legacyUid);
  const data=JSON.parse(await fs.readFile(file,'utf8'));assert.match(data.users.legacy.hash,/^scrypt\$65536\$8\$2\$[a-f0-9]{128}$/);
  assert.equal(data.users.legacy.uid,legacyUid);assert.equal(data.users.legacy.hash.includes('legacy-password'),false);
  assert.equal((await request('/api/login',{user:'legacy',pass:'wrong-password'})).status,401);
  assert.equal((await fetch(base+'/api/me',{headers:{Cookie:'papo_sid='+expiredToken}})).status,401);
});

test('remembered registration, existing login, session revocation and logout remain correct across server replacement',async()=>{
  const username='remembered',password='persist-password-123';
  const registration=await request('/api/register',{user:username,pass:password,remember:true},{'X-Forwarded-Proto':'https'});
  assert.equal(registration.status,200);const identity=await registration.json(),cookie=cookieOf(registration),cookieLine=registration.headers.get('set-cookie');
  assert.match(cookieLine,/HttpOnly/);assert.match(cookieLine,/SameSite=Lax/);assert.match(cookieLine,/Secure/);assert.match(cookieLine,/Max-Age=2592000/);
  let saved=JSON.parse(await fs.readFile(file,'utf8'));assert.match(saved.users[username].hash,/^scrypt\$/);
  const token=cookie.slice('papo_sid='.length),tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  assert.equal(saved.sessions[tokenHash].uid,identity.uid);assert.equal(JSON.stringify(saved).includes(token),false);
  assert.equal((await request('/api/register',{user:username,pass:password})).status,409);
  await stop();await start();
  const resumed=await fetch(base+'/api/me',{headers:{Cookie:cookie}});assert.equal(resumed.status,200);assert.equal((await resumed.json()).uid,identity.uid);
  const login=await request('/api/login',{user:username.toUpperCase(),pass:password,remember:false});assert.equal(login.status,200);assert.equal((await login.json()).uid,identity.uid);
  assert.doesNotMatch(login.headers.get('set-cookie'),/Max-Age=/);
  const secondCookie=cookieOf(login);
  assert.equal((await request('/api/sessions/revoke-others',{}, {Cookie:secondCookie})).status,200);
  assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,401);
  assert.equal((await fetch(base+'/api/me',{headers:{Cookie:secondCookie}})).status,200);
  const logout=await request('/api/logout',{}, {Cookie:secondCookie});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  await stop();await start();
  assert.equal((await fetch(base+'/api/me',{headers:{Cookie:secondCookie}})).status,401);
  const again=await request('/api/login',{user:username,pass:password,remember:true});assert.equal(again.status,200);assert.equal((await again.json()).uid,identity.uid);
  saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.users[username].uid,identity.uid);
});
