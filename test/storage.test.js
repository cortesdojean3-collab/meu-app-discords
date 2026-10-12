const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStorage } = require('../storage');
const empty = () => ({ users:{},profiles:{},sessions:{},msgs:{} });
const copy = data => JSON.parse(JSON.stringify(data));
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'papo-storage-test-'));
  t.after(async () => { assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('papo-storage-test-'));await fs.rm(dir,{recursive:true,force:true}); });
  return path.join(dir,'data.json');
}
function addAccount(data, key) {
  const uid=crypto.randomUUID();
  data.users[key]={ uid,name:key,salt:crypto.randomBytes(16).toString('hex'),hash:'a'.repeat(128),createdAt:Date.now() };
  data.profiles[uid]={ name:key,color:'#7c3aed' };
  return uid;
}

test('production cannot silently create accounts in an ephemeral file', async t => {
  const file=await fixture(t), data=empty();addAccount(data,'saved');
  await fs.writeFile(file,JSON.stringify(data));
  const storage=createStorage({dataFile:file,production:true});
  await assert.rejects(storage.load(),/PERSISTENCE_REQUIRED/);
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),data);
});

test('corrupt local data fails closed without replacing the existing account file', async t => {
  const file=await fixture(t), original='{"users": [';
  await fs.writeFile(file,original);
  await assert.rejects(createStorage({dataFile:file,production:false}).load());
  assert.equal(await fs.readFile(file,'utf8'),original);
});

test('file writes are immutable queued snapshots and survive a new storage instance', async t => {
  const file=await fixture(t), storage=createStorage({dataFile:file,production:false});
  const data=await storage.load();addAccount(data,'alice');
  const first=storage.save(data);addAccount(data,'bob');const second=storage.save(data);
  await Promise.all([first,second]);await storage.close();
  const restarted=createStorage({dataFile:file,production:false});
  assert.deepEqual(Object.keys((await restarted.load()).users).sort(),['alice','bob']);await restarted.close();
});

let PGlite;
try { ({PGlite}=require(process.env.PAPO_TEST_PGLITE_MODULE || '@electric-sql/pglite')); } catch {}
test('PostgreSQL migration, overlapping deploy caches and session revocation preserve durable records', {skip:!PGlite}, async t => {
  const file=await fixture(t), legacy=empty(), alice=addAccount(legacy,'alice');
  const token=crypto.createHash('sha256').update('old-token').digest('hex');
  legacy.sessions[token]={uid:alice,remember:true,exp:Date.now()+86400000,ts:Date.now(),ua:'test'};
  legacy.msgs['msgs-geral']=[{id:'old-message',d:{by:alice,text:'Mensagem preservada',ts:1}}];
  const source=JSON.stringify(legacy);await fs.writeFile(file,source);
  const db=new PGlite();t.after(()=>db.close());
  const query=async(sql,params)=>{
    if (/CREATE TABLE/.test(sql)) {await db.exec(sql);return{rows:[],rowCount:0};}
    const result=await db.query(sql,params);return{...result,rowCount:result.command==='SELECT'?result.rows.length:result.affectedRows};
  };
  const factory=()=>({on(){},query,connect:async()=>({query,release(){}}),async end(){}});
  const options={databaseUrl:'postgres://test@localhost/test',dataFile:file,production:true,poolFactory:factory};
  const oldProcess=createStorage(options), oldCache=await oldProcess.load();
  assert.equal(oldCache.users.alice.uid,alice);
  assert.equal((await oldProcess.readSession(token)).uid,alice);
  assert.equal(await fs.readFile(file,'utf8'),source,'legacy source remains byte-for-byte intact');
  const newProcess=createStorage(options), newCache=await newProcess.load(), bob=addAccount(newCache,'bob');
  const newToken=crypto.createHash('sha256').update('new-token').digest('hex');
  newCache.sessions[newToken]={uid:bob,remember:true,exp:Date.now()+86400000,ts:Date.now(),ua:'new'};
  newCache.msgs['msgs-geral'].push({id:'new-message',d:{by:bob,text:'Mensagem nova',ts:2}});
  await newProcess.save(newCache);
  oldCache.profiles[alice].name='Alice atualizada';await oldProcess.save(oldCache);
  assert.equal((await oldProcess.readUser('bob')).uid,bob,'stale cache does not delete the other process account');
  assert.equal((await oldProcess.readSession(newToken)).uid,bob,'unknown sessions are not deleted');
  assert.equal((await query('select id from papo_messages')).rows.length,2,'unknown messages are not deleted');
  const collision=copy(oldCache);addAccount(collision,'bob');
  await assert.rejects(oldProcess.save(collision),/já existe/);
  assert.equal((await oldProcess.readUser('bob')).uid,bob,'conflicting username does not replace its UID');
  delete newCache.sessions[token];await newProcess.save(newCache);
  oldCache.sessions[token].exp+=10000;await oldProcess.save(oldCache);
  assert.equal(await oldProcess.readSession(token),null,'stale renewal cannot resurrect a logged-out session');
  const observed=await oldProcess.readSession(newToken);oldCache.sessions[newToken]=observed;
  await oldProcess.revokeSession(newToken);delete oldCache.sessions[newToken];
  assert.equal(await newProcess.readSession(newToken),null,'logout removes a foreign session absent from this process baseline');
  oldCache.sessions[newToken]={...observed,exp:observed.exp+10000};await oldProcess.save(oldCache);
  assert.equal(await newProcess.readSession(newToken),null,'an observed foreign session cannot be inserted after revocation');
  const restarted=createStorage(options), restored=await restarted.load();
  assert.equal(restored.users.alice.uid,alice);assert.equal(restored.users.bob.uid,bob);
  assert.equal(restored.sessions[token],undefined);
  assert.equal(restored.msgs['msgs-geral'].length,2);
  const foreignSessions=copy(restored);
  for(const suffix of ['device-1','device-2'])foreignSessions.sessions[suffix]={uid:bob,remember:true,exp:Date.now()+86400000,ts:Date.now(),ua:suffix};
  await restarted.save(foreignSessions);
  await oldProcess.revokeOtherSessions(bob,'device-2');
  assert.equal(await restarted.readSession('device-1'),null,'revoke-others also removes sessions outside the caller cache');
  assert.equal((await oldProcess.listSessions(bob)).length,1);
  assert.equal((await oldProcess.readSession('device-2')).uid,bob);

  const extra=empty();addAccount(extra,'carol');await fs.writeFile(file,JSON.stringify(extra));
  const kvData=empty();addAccount(kvData,'dave');await query('create table kv(k text primary key,v jsonb not null)');
  await query('insert into kv(k,v) values($1,$2::jsonb)',['main',JSON.stringify(kvData)]);
  const importer=createStorage({...options,legacyDataFile:file,importLegacy:true}), merged=await importer.load();
  assert.deepEqual(Object.keys(merged.users).sort(),['alice','bob','carol','dave'],'explicit import merges file and legacy kv into a nonempty database');
  assert.deepEqual((await query('select v from kv where k=$1',['main'])).rows[0].v,kvData,'legacy kv remains intact');
  const conflict=empty();addAccount(conflict,'alice');await fs.writeFile(file,JSON.stringify(conflict));
  await assert.rejects(createStorage({...options,legacyDataFile:file,importLegacy:true}).load(),/Conflito de identidade/);
  assert.equal((await oldProcess.readUser('alice')).uid,alice,'migration conflict rolls back without replacing identities');
  assert.equal(await fs.readFile(file,'utf8'),JSON.stringify(conflict));
  await query('delete from papo_users where user_key=$1',['alice']);
  oldCache.users.alice.hash='b'.repeat(128);
  await assert.rejects(oldProcess.save(oldCache),/não está mais disponível/);
  assert.equal(await oldProcess.readUser('alice'),null,'a stale hash upgrade cannot recreate a deleted account');
  await oldProcess.close();await newProcess.close();await restarted.close();await importer.close();
});
