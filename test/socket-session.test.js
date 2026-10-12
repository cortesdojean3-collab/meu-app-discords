const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const authorization = server.slice(server.indexOf('async function authorizeSocket('), server.indexOf('async function handle('));

test('an existing socket stops accepting actions after another process revokes its session', async () => {
  let session = {uid:'account',exp:Date.now()+60000}, code;
  const c = {ok:true,uid:'account',sh:'hash'};
  const ws = {readyState:1,close(value){code=value;}};
  const context = vm.createContext({Date,storage:{persistent:true,readSession:async()=>session}});
  vm.runInContext(authorization,context);context.c=c;context.ws=ws;
  assert.equal(await vm.runInContext('authorizeSocket(c,ws)',context),true);
  session=null;
  assert.equal(await vm.runInContext('authorizeSocket(c,ws)',context),false);
  assert.equal(c.ok,false);assert.equal(code,4001);
});

test('socket authentication rejects expired or mismatched sessions in local mode too', async () => {
  for (const session of [{uid:'other',exp:Date.now()+60000},{uid:'account',exp:Date.now()-1},undefined]) {
    let code;const c={ok:true,uid:'account',sh:'hash'},ws={readyState:1,close(value){code=value;}};
    const context=vm.createContext({Date,storage:{persistent:false},data:{sessions:{hash:session}},c,ws});
    vm.runInContext(authorization,context);
    assert.equal(await vm.runInContext('authorizeSocket(c,ws)',context),false);assert.equal(code,4001);
  }
});

test('closed sockets do not issue database reads and database failure never grants access', async () => {
  let reads=0;const c={ok:true,uid:'account',sh:'hash'},ws={readyState:3};
  const context=vm.createContext({Date,storage:{persistent:true,readSession:async()=>{reads++;throw new Error('db unavailable');}},c,ws});
  vm.runInContext(authorization,context);
  assert.equal(await vm.runInContext('authorizeSocket(c,ws)',context),false);assert.equal(reads,0);
  ws.readyState=1;
  await assert.rejects(vm.runInContext('authorizeSocket(c,ws)',context),/db unavailable/);
});
