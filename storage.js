'use strict';

const fs = require('fs');
const path = require('path');

function normalize(value) {
  const data = value && typeof value === 'object' ? value : {};
  for (const key of ['users', 'profiles', 'msgs', 'sessions']) {
    if (!data[key] || typeof data[key] !== 'object') data[key] = {};
  }
  delete data.tokens;
  return data;
}

function createStorage({ databaseUrl, dataFile }) {
  let pool = null;
  const persistent = !!databaseUrl;

  async function migrateLegacy(client) {
    const exists = await client.query("select to_regclass('public.kv') as name");
    if (!exists.rows[0].name) return;
    const done = await client.query("select version from papo_schema_migrations where version = 2");
    if (done.rowCount) return;
    const counts = await client.query(`select
      (select count(*)::int from papo_users) users,
      (select count(*)::int from papo_profiles) profiles,
      (select count(*)::int from papo_sessions) sessions,
      (select count(*)::int from papo_messages) messages`);
    const empty = Object.values(counts.rows[0]).every(n => n === 0);
    if (!empty) {
      await client.query('insert into papo_schema_migrations(version) values (2) on conflict do nothing');
      return;
    }

    const legacy = await client.query("select v from kv where k='main'");
    let legacyData = legacy.rows[0]?.v || {};
    const hasLegacyRecords = ['users','profiles','msgs','sessions'].some(key => Object.keys(legacyData[key] || {}).length);
    if (!hasLegacyRecords) {
      try { legacyData = JSON.parse(await fs.promises.readFile(dataFile, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error; }
    }
    const data = normalize(legacyData);
    for (const [key, user] of Object.entries(data.users)) {
      if (!user?.uid || !user.salt || !user.hash) continue;
      await client.query(`insert into papo_users(user_key, uid, name, salt, password_hash, created_at)
        values($1,$2,$3,$4,$5,$6) on conflict(user_key) do nothing`,
      [key, user.uid, user.name || key, user.salt, user.hash, user.createdAt || Date.now()]);
    }
    for (const [uid, profile] of Object.entries(data.profiles)) {
      await client.query('insert into papo_profiles(uid,data) select uid,$2::jsonb from papo_users where uid=$1 on conflict(uid) do nothing', [uid, JSON.stringify(profile)]);
    }
    for (const [tokenHash, session] of Object.entries(data.sessions)) {
      if (!session?.uid) continue;
      await client.query(`insert into papo_sessions(token_hash,uid,remember,expires_at,created_at,user_agent)
        select $1,uid,$3,$4,$5,$6 from papo_users where uid=$2 on conflict(token_hash) do nothing`,
      [tokenHash, session.uid, !!session.remember, session.exp || 0, session.ts || Date.now(), session.ua || '']);
    }
    for (const [channel, items] of Object.entries(data.msgs)) {
      for (const item of Array.isArray(items) ? items : []) {
        const author = item?.d?.by;
        if (!item?.id || !author) continue;
        await client.query(`insert into papo_messages(id,channel,author_uid,data,created_at)
          select $1,$2,uid,$4::jsonb,$5 from papo_users where uid=$3 on conflict(id) do nothing`,
        [item.id, channel, author, JSON.stringify(item.d), item.d.ts || 0]);
      }
    }
    await client.query('insert into papo_schema_migrations(version) values (2) on conflict do nothing');
  }

  async function loadPostgres() {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(72301941)');
      await migrateLegacy(client);
      const data = { users: {}, profiles: {}, msgs: {}, sessions: {} };
      const [users, profiles, sessions, messages] = await Promise.all([
        client.query('select user_key,uid,name,salt,password_hash,created_at from papo_users'),
        client.query('select uid,data from papo_profiles'),
        client.query('select token_hash,uid,remember,expires_at,created_at,user_agent from papo_sessions'),
        client.query('select id,channel,author_uid,data from papo_messages order by created_at desc')
      ]);
      for (const r of users.rows) data.users[r.user_key] = { uid:r.uid, name:r.name, salt:r.salt, hash:r.password_hash, createdAt:Number(r.created_at) };
      for (const r of profiles.rows) data.profiles[r.uid] = r.data;
      for (const r of sessions.rows) data.sessions[r.token_hash] = { uid:r.uid, remember:r.remember, exp:Number(r.expires_at), ts:Number(r.created_at), ua:r.user_agent };
      for (const r of messages.rows) (data.msgs[r.channel] ||= []).push({ id:r.id, d:r.data });
      for (const channel of Object.keys(data.msgs)) data.msgs[channel].reverse();
      await client.query('commit');
      return data;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async function savePostgres(data) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(72301941)');
      const users = Object.entries(data.users);
      for (const [key, user] of users) await client.query(`insert into papo_users(user_key,uid,name,salt,password_hash,created_at)
        values($1,$2,$3,$4,$5,$6) on conflict(user_key) do update set uid=excluded.uid,name=excluded.name,salt=excluded.salt,password_hash=excluded.password_hash`,
      [key,user.uid,user.name || key,user.salt,user.hash,user.createdAt || Date.now()]);
      const userKeys = users.map(([key]) => key);
      await client.query('delete from papo_users where not (user_key = any($1::text[]))', [userKeys]);

      const profiles = Object.entries(data.profiles);
      for (const [uid, profile] of profiles) await client.query(`insert into papo_profiles(uid,data)
        select uid,$2::jsonb from papo_users where uid=$1 on conflict(uid) do update set data=excluded.data`, [uid,JSON.stringify(profile)]);
      await client.query('delete from papo_profiles where not (uid::text = any($1::text[]))', [profiles.map(([uid]) => uid)]);

      const sessions = Object.entries(data.sessions);
      for (const [hash, s] of sessions) await client.query(`insert into papo_sessions(token_hash,uid,remember,expires_at,created_at,user_agent)
        select $1,uid,$3,$4,$5,$6 from papo_users where uid=$2 on conflict(token_hash) do update set uid=excluded.uid,remember=excluded.remember,expires_at=excluded.expires_at,created_at=excluded.created_at,user_agent=excluded.user_agent`,
      [hash,s.uid,!!s.remember,s.exp || 0,s.ts || Date.now(),s.ua || '']);
      await client.query('delete from papo_sessions where not (token_hash = any($1::text[]))', [sessions.map(([hash]) => hash)]);

      const messages = Object.entries(data.msgs).flatMap(([channel,items]) => (Array.isArray(items) ? items : []).map(item => ({channel,item})));
      for (const {channel,item} of messages) {
        if (!item?.d?.by) continue;
        await client.query(`insert into papo_messages(id,channel,author_uid,data,created_at)
          select $1,$2,uid,$4::jsonb,$5 from papo_users where uid=$3 on conflict(id) do update set channel=excluded.channel,author_uid=excluded.author_uid,data=excluded.data,created_at=excluded.created_at`,
        [item.id,channel,item.d.by,JSON.stringify(item.d),item.d.ts || 0]);
      }
      const ids = messages.map(({item}) => item.id);
      await client.query('delete from papo_messages where not (id = any($1::text[]))', [ids]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  return {
    get persistent() { return persistent; },
    get pool() { return pool; },
    async load() {
      if (!databaseUrl) {
        try { return normalize(JSON.parse(await fs.promises.readFile(dataFile, 'utf8'))); }
        catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error; return normalize({}); }
      }
      const { Pool } = require('pg');
      pool = new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : { rejectUnauthorized: false } });
      pool.on('error', error => console.warn(JSON.stringify({ l:'warn',ctx:'db',msg:'conexao ociosa caiu (pool se recupera)',m:error.message })));
      await pool.query('create table if not exists kv(k text primary key, v jsonb not null)');
      await pool.query('create table if not exists papo_schema_migrations(version integer primary key, applied_at timestamptz not null default now())');
      const migration = await fs.promises.readFile(path.join(__dirname,'migrations','001_persistent_data.sql'),'utf8');
      await pool.query(migration);
      return loadPostgres();
    },
    async save(data) {
      if (pool) return savePostgres(data);
      const temp = dataFile + '.tmp';
      await fs.promises.mkdir(path.dirname(dataFile), { recursive:true });
      await fs.promises.writeFile(temp, JSON.stringify(data));
      try { await fs.promises.rename(temp, dataFile); }
      catch (error) {
        if (!['EPERM','EEXIST','ENOTEMPTY'].includes(error.code)) throw error;
        await fs.promises.copyFile(temp, dataFile);
        await fs.promises.unlink(temp).catch(() => {});
      }
    },
    async health() { if (!pool) return false; await pool.query('select 1'); return true; },
    async close() { if (pool) await pool.end(); }
  };
}

module.exports = { createStorage };
