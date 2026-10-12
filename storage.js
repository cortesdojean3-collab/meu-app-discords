'use strict';
const fs = require('fs');
const path = require('path');
const RECORDS = ['users', 'profiles', 'msgs', 'sessions'];
const emptyData = () => ({ users: {}, profiles: {}, msgs: {}, sessions: {} });
const clone = data => JSON.parse(JSON.stringify(data));
function normalize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Arquivo de dados inválido; restaure um backup antes de iniciar.');
  for (const key of RECORDS) {
    if (value[key] === undefined) value[key] = {};
    if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])) throw new Error('Coleção inválida; os dados existentes não foram substituídos.');
  }
  return value;
}
const changed = (before, after) => JSON.stringify(before) !== JSON.stringify(after);
const messagesById = data => Object.fromEntries(Object.entries(data.msgs).flatMap(([channel, items]) =>
  (Array.isArray(items) ? items : []).map(item => [item.id, { channel, item }])));
function createStorage({ databaseUrl, dataFile, legacyDataFile, importLegacy = false, production = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true', poolFactory }) {
  let pool = null, baseline = emptyData(), writes = Promise.resolve();
  const observedSessions = new Set();
  const observedUsers = new Map();
  const persistent = !!databaseUrl;
  async function readFile(file, required = false) {
    try { return normalize(JSON.parse(await fs.promises.readFile(file, 'utf8'))); }
    catch (error) { if (!required && error.code === 'ENOENT') return null; throw error; }
  }
  async function migrateLegacy(client) {
    const done = await client.query('select version from papo_schema_migrations where version = 3');
    if (done.rowCount && !importLegacy) return;
    const sources = [];
    const exists = await client.query("select to_regclass('public.kv') as name");
    if (exists.rows[0].name) {
      const legacy = await client.query("select v from kv where k='main'");
      if (legacy.rows[0]?.v) sources.push(normalize(typeof legacy.rows[0].v === 'string' ? JSON.parse(legacy.rows[0].v) : legacy.rows[0].v));
    }
    const fileData = await readFile(legacyDataFile || dataFile, !!legacyDataFile);
    if (fileData) sources.push(fileData);
    for (const data of sources) {
      for (const [key, user] of Object.entries(data.users)) {
        if (!user?.uid || !user.salt || !user.hash) throw new Error('Conta legada sem UID ou hash; importação cancelada sem alterar a origem.');
        const inserted = await client.query(`insert into papo_users(user_key,uid,name,salt,password_hash,created_at)
          values($1,$2,$3,$4,$5,$6) on conflict do nothing`, [key,user.uid,user.name || key,user.salt,user.hash,user.createdAt || Date.now()]);
        if (!inserted.rowCount) {
          const existing = await client.query('select uid from papo_users where user_key=$1', [key]);
          if (existing.rows[0]?.uid !== user.uid) throw new Error('Conflito de identidade no backup; importação cancelada sem sobrescrever contas existentes.');
        }
      }
      for (const [uid, profile] of Object.entries(data.profiles)) await client.query(`insert into papo_profiles(uid,data)
        select uid,$2::jsonb from papo_users where uid=$1 on conflict(uid) do nothing`, [uid,JSON.stringify(profile)]);
      for (const [hash, session] of Object.entries(data.sessions)) {
        if (!session?.uid) continue;
        await client.query(`insert into papo_sessions(token_hash,uid,remember,expires_at,created_at,user_agent)
          select $1,uid,$3,$4,$5,$6 from papo_users where uid=$2 on conflict(token_hash) do nothing`,
        [hash,session.uid,!!session.remember,session.exp || 0,session.ts || Date.now(),session.ua || '']);
      }
      for (const { channel, item } of Object.values(messagesById(data))) {
        if (!item?.d?.by) continue;
        await client.query(`insert into papo_messages(id,channel,author_uid,data,created_at)
          select $1,$2,uid,$4::jsonb,$5 from papo_users where uid=$3 on conflict(id) do nothing`,
        [item.id,channel,item.d.by,JSON.stringify(item.d),item.d.ts || 0]);
      }
    }
    await client.query('insert into papo_schema_migrations(version) values (3) on conflict do nothing');
  }
  const userFromRow = r => r && ({ uid:r.uid,name:r.name,salt:r.salt,hash:r.password_hash,createdAt:Number(r.created_at) });
  const sessionFromRow = r => r && ({ uid:r.uid,remember:r.remember,exp:Number(r.expires_at),ts:Number(r.created_at),ua:r.user_agent });
  async function loadPostgres() {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(72301941)');
      await client.query(await fs.promises.readFile(path.join(__dirname,'migrations','001_persistent_data.sql'),'utf8'));
      await migrateLegacy(client);
      const data = emptyData();
      const [users, profiles, sessions, messages] = await Promise.all([
        client.query('select user_key,uid,name,salt,password_hash,created_at from papo_users'),
        client.query('select uid,data from papo_profiles'),
        client.query('select token_hash,uid,remember,expires_at,created_at,user_agent from papo_sessions'),
        client.query('select id,channel,author_uid,data from papo_messages order by created_at asc')
      ]);
      for (const r of users.rows) data.users[r.user_key] = userFromRow(r);
      for (const r of profiles.rows) data.profiles[r.uid] = r.data;
      for (const r of sessions.rows) data.sessions[r.token_hash] = sessionFromRow(r);
      for (const r of messages.rows) (data.msgs[r.channel] ||= []).push({ id:r.id,d:r.data });
      await client.query('commit'); baseline = clone(data); return data;
    } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async function savePostgres(data) {
    const client = await pool.connect();
    try {
      await client.query('begin'); await client.query('select pg_advisory_xact_lock(72301941)');
      // Write only this process's changes: overlapping deploys must preserve unknown rows.
      for (const [key, user] of Object.entries(data.users)) {
        if (!changed(baseline.users[key], user)) continue;
        const known = baseline.users[key]?.uid === user.uid || observedUsers.get(key) === user.uid;
        const result = known
          ? await client.query('update papo_users set name=$3,salt=$4,password_hash=$5 where user_key=$1 and uid=$2', [key,user.uid,user.name || key,user.salt,user.hash])
          : await client.query(`insert into papo_users(user_key,uid,name,salt,password_hash,created_at)
              values($1,$2,$3,$4,$5,$6) on conflict do nothing`, [key,user.uid,user.name || key,user.salt,user.hash,user.createdAt || Date.now()]);
        if (!result.rowCount) throw new Error(known ? 'A conta não está mais disponível. Entre novamente.' : 'Esse usuário já existe em outra instância. Tente entrar na conta.');
      }
      for (const [key, user] of Object.entries(baseline.users)) if (!data.users[key]) await client.query('delete from papo_users where user_key=$1 and uid=$2', [key,user.uid]);
      for (const [uid, profile] of Object.entries(data.profiles)) if (changed(baseline.profiles[uid], profile)) await client.query(`insert into papo_profiles(uid,data)
        select uid,$2::jsonb from papo_users where uid=$1 on conflict(uid) do update set data=excluded.data`, [uid,JSON.stringify(profile)]);
      for (const uid of Object.keys(baseline.profiles)) if (!data.profiles[uid]) await client.query('delete from papo_profiles where uid=$1', [uid]);
      for (const [hash, session] of Object.entries(data.sessions)) {
        if (!changed(baseline.sessions[hash], session)) continue;
        const values = [hash,session.uid,!!session.remember,session.exp || 0,session.ts || Date.now(),session.ua || ''];
        if (baseline.sessions[hash] || observedSessions.has(hash)) await client.query(`update papo_sessions set remember=$3,expires_at=greatest(expires_at,$4),user_agent=$5
          where token_hash=$1 and uid=$2`, [hash,session.uid,!!session.remember,session.exp || 0,session.ua || '']);
        else await client.query(`insert into papo_sessions(token_hash,uid,remember,expires_at,created_at,user_agent)
          select $1,uid,$3,$4,$5,$6 from papo_users where uid=$2 on conflict(token_hash) do nothing`, values);
      }
      for (const hash of Object.keys(baseline.sessions)) if (!data.sessions[hash]) await client.query('delete from papo_sessions where token_hash=$1', [hash]);
      const messages = messagesById(data), previousMessages = messagesById(baseline);
      for (const [id, { channel, item }] of Object.entries(messages)) {
        if (!item?.d?.by || !changed(previousMessages[id], { channel,item })) continue;
        await client.query(`insert into papo_messages(id,channel,author_uid,data,created_at)
          select $1,$2,uid,$4::jsonb,$5 from papo_users where uid=$3 on conflict(id) do update
          set channel=excluded.channel,data=excluded.data,created_at=excluded.created_at
          where papo_messages.author_uid=excluded.author_uid`, [id,channel,item.d.by,JSON.stringify(item.d),item.d.ts || 0]);
      }
      for (const id of Object.keys(previousMessages)) if (!messages[id]) await client.query('delete from papo_messages where id=$1', [id]);
      await client.query('commit'); baseline = clone(data);
    } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async function saveFile(data) {
    const temp = dataFile + '.tmp';
    await fs.promises.mkdir(path.dirname(dataFile), { recursive:true });
    const handle = await fs.promises.open(temp, 'w', 0o600);
    try { await handle.writeFile(JSON.stringify(data)); await handle.sync(); } finally { await handle.close(); }
    try { await fs.promises.rename(temp, dataFile); }
    catch (error) {
      if (!['EPERM','EEXIST','ENOTEMPTY'].includes(error.code)) throw error;
      // Preserve a recoverable previous copy before Windows's non-atomic fallback.
      try { await fs.promises.copyFile(dataFile, dataFile + '.previous'); } catch (backupError) { if (backupError.code !== 'ENOENT') throw backupError; }
      await fs.promises.copyFile(temp, dataFile);
      await fs.promises.unlink(temp).catch(() => {});
    }
  }
  return {
    get persistent() { return persistent; }, get pool() { return pool; },
    async load() {
      if (!databaseUrl) {
        if (production) throw new Error('PERSISTENCE_REQUIRED: configure DATABASE_URL no serviço de produção. Arquivo efêmero não é permitido. Faça backup das contas antes de redeploy.');
        const data = await readFile(dataFile) || emptyData(); baseline = clone(data); return data;
      }
      const database = new URL(databaseUrl);
      const local = ['localhost','127.0.0.1','::1','[::1]'].includes(database.hostname);
      const internalRender = database.hostname.startsWith('dpg-') && !database.hostname.includes('.');
      const options = { connectionString:databaseUrl,max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000,
        ssl: local || internalRender ? false : { rejectUnauthorized:true } };
      pool = poolFactory ? poolFactory(options) : new (require('pg').Pool)(options);
      pool.on('error', () => console.warn('[papo] A conexão ociosa do banco caiu; o pool tentará recuperar.'));
      try { return await loadPostgres(); }
      catch (error) { await pool.end().catch(() => {}); pool = null; throw error; }
    },
    save(value) {
      const snapshot = clone(value), next = writes.then(() => persistent ? savePostgres(snapshot) : saveFile(snapshot));
      writes = next.catch(() => {}); return next;
    },
    async readSession(hash) {
      const result = await pool.query('select token_hash,uid,remember,expires_at,created_at,user_agent from papo_sessions where token_hash=$1', [hash]);
      if (result.rows[0]) observedSessions.add(hash);
      return sessionFromRow(result.rows[0]) || null;
    },
    async readUser(key) {
      const result = await pool.query('select user_key,uid,name,salt,password_hash,created_at from papo_users where user_key=$1', [key]);
      if (result.rows[0]) observedUsers.set(key,result.rows[0].uid);
      return userFromRow(result.rows[0]) || null;
    },
    async revokeSession(hash) { await pool.query('delete from papo_sessions where token_hash=$1',[hash]); },
    async revokeOtherSessions(uid,keep) { await pool.query('delete from papo_sessions where uid=$1 and token_hash<>$2',[uid,keep]); },
    async listSessions(uid) {
      const result=await pool.query('select token_hash,uid,remember,expires_at,created_at,user_agent from papo_sessions where uid=$1 and expires_at>$2',[uid,Date.now()]);
      return result.rows.map(row=>[row.token_hash,sessionFromRow(row)]);
    },
    async health() { if (!pool) return false; await pool.query('select 1'); return true; },
    async close() { await writes; if (pool) await pool.end(); }
  };
}
module.exports = { createStorage };
