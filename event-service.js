'use strict';
const fs = require('fs');
const path = require('path');
const { defaults, normalizeConfig, publicState, discoveryAllowed, bootstrap, eventError } = require('./event-state');
const copy = value => JSON.parse(JSON.stringify(value));

function createEventService({ pool = null, dataFile, users = {}, env = process.env, now = Date.now, logger = () => {} } = {}) {
  let record = { config: defaults(), revision: 0, admins: [], bindings: {}, discoveries: {} };
  let writes = Promise.resolve();
  const queued = operation => { const next = writes.then(operation); writes = next.catch(() => {}); return next; };
  const knownUser = uid => Object.values(users).some(user => user.uid === uid);
  async function writeFile(next) {
    await fs.promises.mkdir(path.dirname(dataFile), { recursive: true });
    const temporary = dataFile + '.tmp';
    const handle = await fs.promises.open(temporary, 'w', 0o600);
    try { await handle.writeFile(JSON.stringify(next)); await handle.sync(); } finally { await handle.close(); }
    try { await fs.promises.rename(temporary, dataFile); }
    catch (error) {
      if (!['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      try { await fs.promises.copyFile(dataFile, dataFile + '.previous'); } catch (backupError) { if (backupError.code !== 'ENOENT') throw backupError; }
      await fs.promises.copyFile(temporary, dataFile);
      await fs.promises.unlink(temporary).catch(() => {});
    }
    record = next;
  }
  async function readConfig() {
    if (!pool) return { config: copy(record.config), revision: record.revision };
    const result = await pool.query('select config,revision from papo_event_config where id=true');
    if (!result.rows[0]) throw new Error('Configuração persistente do evento indisponível.');
    return { config: result.rows[0].config, revision: result.rows[0].revision };
  }
  async function canAdmin(uid) {
    if (!pool) return knownUser(uid) && record.admins.includes(uid);
    const result = await pool.query('select uid from papo_event_admins where uid=$1', [uid]);
    return Boolean(result.rowCount);
  }
  async function adminState(uid) {
    if (!await canAdmin(uid)) throw eventError('Apenas o administrador pode configurar o evento.', 403);
    const current = await readConfig();
    return { ...current, serverNow: new Date(now()).toISOString() };
  }
  async function state(uid) {
    const current = await readConfig();
    let discoveries = [];
    if (uid) {
      if (pool) discoveries = (await pool.query('select kind from papo_event_discoveries where uid=$1 order by discovered_at,kind', [uid])).rows.map(row => row.kind);
      else discoveries = record.discoveries[uid] || [];
    }
    return publicState(current.config, { now: now(), revision: current.revision, discoveries, canAdmin: uid ? await canAdmin(uid) : false });
  }
  async function update(uid, input) {
    if (!await canAdmin(uid)) throw eventError('Apenas o administrador pode configurar o evento.', 403);
    if (!input || !Number.isInteger(input.revision) || input.revision < 0) throw eventError('Revisão inválida. Reabra a configuração.');
    if (!pool) return queued(async () => {
      if (input.revision !== record.revision) throw eventError('O evento foi editado em outra janela. Atualize antes de salvar.', 409);
      const config = normalizeConfig(input.config, record.config);
      await writeFile({ ...copy(record), config, revision: record.revision + 1 });
      return adminState(uid);
    });
    const current = await readConfig();
    if (input.revision !== current.revision) throw eventError('O evento foi editado em outra janela. Atualize antes de salvar.', 409);
    const config = normalizeConfig(input.config, current.config);
    const updated = await pool.query('update papo_event_config set config=$1::jsonb,revision=revision+1,updated_by=$2,updated_at=now() where id=true and revision=$3 returning revision', [JSON.stringify(config), uid, input.revision]);
    if (!updated.rowCount) throw eventError('O evento foi editado em outra janela. Atualize antes de salvar.', 409);
    return { config, revision: updated.rows[0].revision, serverNow: new Date(now()).toISOString() };
  }
  async function discover(uid, kind) {
    const current = await state(uid);
    if (!discoveryAllowed(kind, current)) throw eventError('Esta surpresa não está disponível neste momento.', 403);
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const locked = await client.query('select config,revision from papo_event_config where id=true for share');
        if (!locked.rows[0] || !discoveryAllowed(kind, publicState(locked.rows[0].config, { now: now() }))) throw eventError('Esta surpresa não está disponível neste momento.', 403);
        await client.query('insert into papo_event_discoveries(uid,kind) values($1,$2) on conflict(uid,kind) do nothing', [uid, kind]);
        await client.query('commit');
      } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
      finally { client.release(); }
    }
    else await queued(async () => {
      // Recheck after earlier queued edits; a disabled event cannot record a new discovery.
      if (!discoveryAllowed(kind, publicState(record.config, { now: now() }))) throw eventError('Esta surpresa não está disponível neste momento.', 403);
      if ((record.discoveries[uid] || []).includes(kind)) return;
      const next = copy(record);
      (next.discoveries[uid] ||= []).push(kind);
      await writeFile(next);
    });
    return state(uid);
  }
  async function letter(uid, day) {
    if (!Number.isInteger(day) || day < 1 || day > 30) throw eventError('Carta inexistente.', 404);
    const current = await state(uid), found = current.config.letters[day - 1];
    if (!found.unlocked) throw eventError('Esta carta ainda não está disponível.', 403);
    return found;
  }
  async function grantAdmin(uid) {
    if (!knownUser(uid)) { logger('Administrador indicado não corresponde a uma conta existente.'); return; }
    if (pool) await pool.query('insert into papo_event_admins(uid) select uid from papo_users where uid=$1 on conflict(uid) do nothing', [uid]);
    else if (!record.admins.includes(uid)) record.admins.push(uid);
  }
  async function initialize() {
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(72301942)');
        await client.query(await fs.promises.readFile(path.join(__dirname, 'migrations', '002_event.sql'), 'utf8'));
        await client.query('insert into papo_event_config(id,config) values(true,$1::jsonb) on conflict(id) do nothing', [JSON.stringify(defaults())]);
        await client.query('commit');
      } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
      finally { client.release(); }
    } else {
      try {
        const saved = JSON.parse(await fs.promises.readFile(dataFile, 'utf8'));
        if (!saved || !Number.isInteger(saved.revision) || !Array.isArray(saved.admins) || !saved.bindings || !saved.discoveries) throw new Error('Dados locais do evento inválidos; restaure o backup.');
        record = { ...saved, config: normalizeConfig(saved.config) };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const adminUser = (env.PAPO_EVENT_ADMIN_USER || '').trim();
    if (adminUser) {
      const existing = pool ? (await pool.query('select uid from papo_event_admin_bootstrap where source=$1', ['username'])).rows[0] : Object.hasOwn(record.bindings, 'username') ? { uid: record.bindings.username } : null;
      if (existing) { if (existing.uid) await grantAdmin(existing.uid); }
      else {
        const user = users[adminUser.toLowerCase()];
        if (user) {
          if (pool) {
            const binding = await pool.query('insert into papo_event_admin_bootstrap(source,uid) values($1,$2) on conflict(source) do nothing returning uid', ['username', user.uid]);
            if (binding.rowCount) await grantAdmin(user.uid);
            else { const winner = await pool.query('select uid from papo_event_admin_bootstrap where source=$1', ['username']); if (winner.rows[0]?.uid) await grantAdmin(winner.rows[0].uid); }
          } else { record.bindings.username = user.uid; await grantAdmin(user.uid); }
        } else logger('A conta escolhida para administrar o evento ainda não existe; o painel permanece bloqueado.');
      }
    }
    for (const uid of (env.PAPO_EVENT_ADMIN_UIDS || '').split(',').map(value => value.trim()).filter(Boolean)) {
      if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uid)) await grantAdmin(uid);
      else logger('UID administrativo inválido; acesso não concedido.');
    }
    if (env.PAPO_EVENT_START || env.PAPO_EVENT_END) {
      const current = await readConfig();
      if (current.revision === 0) {
        const patch = { enabled: true, startsAt: env.PAPO_EVENT_START, endsAt: env.PAPO_EVENT_END, timeZone: env.PAPO_EVENT_TIME_ZONE || 'America/Sao_Paulo' };
        if (env.PAPO_EVENT_MEETING_DATE) { patch.meetingDate = env.PAPO_EVENT_MEETING_DATE; patch.publishMeetingDate = true; }
        const config = normalizeConfig(patch, current.config);
        if (pool) await pool.query('update papo_event_config set config=$1::jsonb,revision=1,updated_at=now() where id=true and revision=0', [JSON.stringify(config)]);
        else record = { ...record, config, revision: 1 };
      }
    }
    if (!pool) await writeFile(copy(record));
    return this;
  }
  return { initialize, state, adminState, update, discover, letter, canAdmin, async bootstrap() { return bootstrap(await state(null)); }, async close() { await writes; } };
}
module.exports = { createEventService };
