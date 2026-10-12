const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const PORT = +process.env.PORT || 3000, HOST = '0.0.0.0', INVITE = process.env.INVITE_CODE || '';
const DEFAULT_REPO = 'cortesdojean3-collab/meu-app-discords';
const configuredRepo = process.env.GITHUB_REPO || DEFAULT_REPO;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(configuredRepo) ? configuredRepo : DEFAULT_REPO;
const DB = process.env.DATA_FILE || path.join(__dirname, 'data.json'), START = Date.now();
const FILES = { win: 'Papo-win.exe', mac: 'Papo-mac.dmg', linux: 'Papo-linux.AppImage' };
const MIME = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const VC = ['voz1', 'voz2'], EMOJI = ['👍', '❤️', '😂', '🎉', '😮'], DAY = 864e5, TTL_SHORT = 12 * 36e5, TTL_LONG = 30 * DAY;
const log = (l, ctx, msg, x) => (l === 'error' ? console.error : console.log)(JSON.stringify({ t: new Date().toISOString(), l, ctx, msg, ...x }));
const TEMP = /ECONNRESET|EPIPE|ETIMEDOUT|ERR_STREAM|socket hang up|ECONNABORTED/;
process.on('uncaughtException', e => { if (TEMP.test((e.code || '') + e.message)) return log('warn', 'proc', 'erro de rede ignorado', { m: e.message }); log('error', 'proc', 'erro fatal', { m: e.message, s: (e.stack || '').split('\n')[1] }); shutdown('fatal', 1); });
process.on('unhandledRejection', e => log('error', 'proc', 'promise rejeitada', { m: String((e && e.message) || e) }));
/* ---------- banco: Postgres (DATABASE_URL) ou arquivo ---------- */
let data = {}, pool = null, tm, flushing = false, again = false;
async function load() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg'), url = process.env.DATABASE_URL;
    pool = new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
    pool.on('error', e => log('warn', 'db', 'conexao ociosa caiu (pool se recupera)', { m: e.message }));
    await pool.query('create table if not exists kv(k text primary key, v jsonb not null)');
    const r = await pool.query("select v from kv where k='main'"); if (r.rows[0]) data = r.rows[0].v;
  } else { try { data = JSON.parse(fs.readFileSync(DB)); } catch (e) {} log('warn', 'db', 'sem DATABASE_URL: dados em arquivo (no plano gratis do Render somem a cada deploy)'); }
  for (const k of ['users', 'profiles', 'msgs', 'sessions']) data[k] = data[k] || {};
  delete data.tokens; // tokens antigos (localStorage) foram substituidos por cookies; contas sao mantidas
}
async function flush() {
  if (flushing) { again = true; return; } flushing = true;
  try {
    const s = JSON.stringify(data);
    if (pool) await pool.query("insert into kv(k,v) values('main',$1) on conflict(k) do update set v=excluded.v", [s]);
    else { await fs.promises.writeFile(DB + '.tmp', s); await fs.promises.rename(DB + '.tmp', DB); }
  } catch (e) { log('error', 'db', 'falha ao salvar', { m: e.message }); }
  finally { flushing = false; if (again) { again = false; flush(); } }
}
const save = () => { clearTimeout(tm); tm = setTimeout(flush, 800); };
const flushAll = async () => { clearTimeout(tm); await flush(); while (flushing || again) await new Promise(r => setTimeout(r, 50)); };
/* ---------- sessoes (cookie HttpOnly) e contas ---------- */
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const sh = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const scrypt = (p, s) => new Promise((ok, no) => crypto.scrypt(p, s, 64, (e, k) => e ? no(e) : ok(k.toString('hex'))));
const cookie = (req, n) => { const m = (req.headers.cookie || '').split(/;\s*/).find(x => x.startsWith(n + '=')); return m ? m.slice(n.length + 1) : ''; };
const secure = req => req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
function setCookie(req, res, sid, remember, clear) {
  res.setHeader('Set-Cookie', `papo_sid=${clear ? '' : sid}; Path=/; HttpOnly; SameSite=Lax${secure(req) ? '; Secure' : ''}${clear ? '; Max-Age=0' : remember ? '; Max-Age=' + TTL_LONG / 1000 : ''}`);
}
function sess(req) {
  const k = sh(cookie(req, 'papo_sid')), s = data.sessions[k];
  if (!s) return null;
  if (s.exp < Date.now()) { delete data.sessions[k]; save(); return null; }
  return Object.assign({ k }, s);
}
function renew(req, res, s) {
  const ttl = s.remember ? TTL_LONG : TTL_SHORT;
  if (s.exp - Date.now() < ttl / 2) { data.sessions[s.k].exp = Date.now() + ttl; save(); if (res) setCookie(req, res, cookie(req, 'papo_sid'), s.remember); }
}
setInterval(() => { const n = Date.now(); let c = 0; for (const k in data.sessions) if (data.sessions[k].exp < n) { delete data.sessions[k]; c++; } if (c) save(); }, 36e5).unref();
const sameOrigin = req => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch (e) { return false; } };
const tries = {}, inflight = new Set();
const limited = ip => { const x = tries[ip] = tries[ip] || { n: 0, t: Date.now() }; if (Date.now() - x.t > 6e5) { x.n = 0; x.t = Date.now(); } return ++x.n > 25; };
setInterval(() => { for (const k in tries) if (Date.now() - tries[k].t > 6e5) delete tries[k]; }, 6e5).unref();
const COLORS = ['#7c3aed', '#2563eb', '#db2777', '#059669', '#d97706', '#0891b2'];
const readJson = req => new Promise(ok => { let b = ''; req.on('data', d => { b += d; if (b.length > 4000) { req.destroy(); ok({}); } }); req.on('end', () => { try { ok(JSON.parse(b)); } catch (e) { ok({}); } }); req.on('error', () => ok({})); });
const ip = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
function newSession(req, res, uid, remember) {
  const sid = crypto.randomBytes(32).toString('base64url');
  data.sessions[sh(sid)] = { uid, remember, exp: Date.now() + (remember ? TTL_LONG : TTL_SHORT), ts: Date.now(), ua: String(req.headers['user-agent'] || '').slice(0, 70) };
  save(); setCookie(req, res, sid, remember);
}
async function auth(req, res, reg) {
  if (!/application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { erro: 'Requisição inválida.' });
  if (limited(ip(req))) return json(res, 429, { erro: 'Muitas tentativas. Espere alguns minutos.' });
  const b = await readJson(req), name = String(b.user || '').trim(), key = name.toLowerCase(), pass = String(b.pass || '');
  if (!name || !pass) return json(res, 400, { erro: 'Preencha usuário e senha.' });
  if (reg) {
    if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(name)) return json(res, 400, { erro: 'Usuário: 3 a 20 letras, números, _ . -' });
    if (pass.length < 6 || pass.length > 100) return json(res, 400, { erro: 'A senha precisa ter de 6 a 100 caracteres.' });
    if (INVITE && b.invite !== INVITE) return json(res, 403, { erro: 'Código de convite incorreto.' });
    if (data.users[key] || inflight.has(key)) return json(res, 409, { erro: 'Esse usuário já existe.' });
    inflight.add(key);
    try {
      const salt = crypto.randomBytes(16).toString('hex'), h = await scrypt(pass, salt);
      if (data.users[key]) return json(res, 409, { erro: 'Esse usuário já existe.' });
      const uid = crypto.randomUUID();
      data.users[key] = { uid, salt, hash: h, name };
      data.profiles[uid] = { name, status: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], avatar: '' };
      bc({ t: 'doc', c: 'profiles', id: uid, d: data.profiles[uid] });
      newSession(req, res, uid, !!b.remember); log('info', 'auth', 'conta criada', { uid });
      return json(res, 200, { uid, name });
    } finally { inflight.delete(key); }
  }
  const u = data.users[key], h = await scrypt(pass, u ? u.salt : 'x'.repeat(32));
  if (!u || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(u.hash))) return json(res, 401, { erro: 'Usuário ou senha incorretos.' });
  newSession(req, res, u.uid, !!b.remember); json(res, 200, { uid: u.uid, name: u.name });
}
function dropSessions(uid, keep) { for (const k in data.sessions) if (data.sessions[k].uid === uid && k !== keep) delete data.sessions[k]; C.forEach(c => { if (c.uid === uid && c.sh !== keep) { try { c.ws.close(4001); } catch (e) {} } }); save(); }
async function api(req, res, u) {
  if (req.method === 'POST' && !sameOrigin(req)) return json(res, 403, { erro: 'Origem não permitida.' });
  if (u === '/api/login' || u === '/api/register') return req.method === 'POST' ? auth(req, res, u === '/api/register') : json(res, 405, {});
  const s = sess(req);
  if (u === '/api/me') { if (!s) return json(res, 401, { erro: 'Sessão expirada.' }); renew(req, res, s); return json(res, 200, { uid: s.uid }); }
  if (!s) return json(res, 401, { erro: 'Sessão expirada.' });
  if (u === '/api/logout' && req.method === 'POST') { delete data.sessions[s.k]; save(); C.forEach(c => { if (c.sh === s.k) try { c.ws.close(4001); } catch (e) {} }); setCookie(req, res, '', false, true); return json(res, 200, {}); }
  if (u === '/api/sessions') return json(res, 200, Object.entries(data.sessions).filter(([, v]) => v.uid === s.uid).map(([k, v]) => ({ ua: v.ua || 'Dispositivo', ts: v.ts, current: k === s.k })));
  if (u === '/api/sessions/revoke-others' && req.method === 'POST') { dropSessions(s.uid, s.k); return json(res, 200, {}); }
  if (u === '/api/delete' && req.method === 'POST') {
    const b = await readJson(req), me = Object.entries(data.users).find(([, v]) => v.uid === s.uid);
    if (!me || !crypto.timingSafeEqual(Buffer.from(await scrypt(String(b.pass || ''), me[1].salt)), Buffer.from(me[1].hash))) return json(res, 401, { erro: 'Senha incorreta.' });
    delete data.users[me[0]]; delete data.profiles[s.uid];
    for (const c in data.msgs) data.msgs[c] = data.msgs[c].filter(m => m.d.by !== s.uid);
    dropSessions(s.uid, null); setCookie(req, res, '', false, true); bc({ t: 'doc', c: 'profiles', id: s.uid, d: null }); log('info', 'auth', 'conta excluida', { uid: s.uid });
    return json(res, 200, {});
  }
  json(res, 404, { erro: 'Não encontrado.' });
}
/* ---------- downloads ---------- */
let releaseCache = { at: 0, value: null, pending: null };
function requestReleases(url) {
  return new Promise(resolve => {
    const req = https.get(url, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Papo-downloads' }, timeout: 6000
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(new Error('resposta grande demais')); });
      res.on('end', () => { let value = null; if (res.statusCode === 200) try { value = JSON.parse(body); } catch (e) {} resolve(value); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
  });
}
function latestRelease() {
  if (releaseCache.pending) return releaseCache.pending;
  if (Date.now() - releaseCache.at < 5 * 60e3) return Promise.resolve(releaseCache.value);
  releaseCache.pending = requestReleases(`https://api.github.com/repos/${REPO}/releases/latest`).then(value => {
    releaseCache = { at: Date.now(), value, pending: null };
    return value;
  });
  return releaseCache.pending;
}
let historyCache = { at: 0, value: null, pending: null };
function releaseHistory() {
  if (historyCache.pending) return historyCache.pending;
  if (Date.now() - historyCache.at < 5 * 60e3) return Promise.resolve(historyCache.value);
  historyCache.pending = requestReleases(`https://api.github.com/repos/${REPO}/releases?per_page=10`).then(value => {
    const releases = Array.isArray(value) ? value.filter(r => !r.draft && !r.prerelease) : null;
    historyCache = { at: Date.now(), value: releases, pending: null };
    return releases;
  });
  return historyCache.pending;
}
const local = n => fs.existsSync(path.join(__dirname, 'downloads', n));
async function avail() {
  const [release, history] = await Promise.all([latestRelease(), releaseHistory()]);
  const assets = release && Array.isArray(release.assets) ? release.assets : [];
  const platforms = {};
  for (const [key, name] of Object.entries(FILES)) {
    const asset = assets.find(a => a.name === name && a.size > 0);
    platforms[key] = asset ? { name, size: asset.size, url: asset.browser_download_url, downloads: asset.download_count || 0 } : null;
  }
  const checksums = assets.find(a => a.name === 'SHA256SUMS.txt' && a.size > 0);
  const older = (history || []).filter(r => r.tag_name !== (release && release.tag_name)).map(r => ({
    version: r.tag_name, name: r.name || r.tag_name, publishedAt: r.published_at, url: r.html_url,
    checksums: (r.assets || []).find(a => a.name === 'SHA256SUMS.txt' && a.size > 0)?.browser_download_url || null,
    assets: Object.fromEntries(Object.entries(FILES).map(([key, name]) => {
      const asset = (r.assets || []).find(a => a.name === name && a.size > 0);
      return [key, asset ? { name, size: asset.size, url: asset.browser_download_url } : null];
    }))
  })).filter(r => Object.values(r.assets).some(Boolean));
  return { lookupOk: history !== null || release !== null, win: !!platforms.win || local(FILES.win), mac: !!platforms.mac || local(FILES.mac), linux: !!platforms.linux || local(FILES.linux), version: release && release.tag_name || null, publishedAt: release && release.published_at || null, notes: release && release.body || '', releaseUrl: release && release.html_url || null, checksums: checksums && checksums.browser_download_url || null, assets: platforms, releases: older };
}
/* ---------- http ---------- */
function serve(res, file) {
  fs.stat(file, (e, s) => {
    if (e || !s.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nao encontrado'); }
    const h = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': s.size };
    if (/\.(exe|dmg|AppImage)$/.test(file)) h['Content-Disposition'] = 'attachment; filename="' + path.basename(file) + '"';
    res.writeHead(200, h); fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}
const srv = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
  try {
    let u; try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
    if (u.startsWith('/api/')) { if (u === '/api/downloads') return json(res, 200, await avail()); return await api(req, res, u); }
    if (u === '/health') {
      let ok = true; if (pool) { try { await Promise.race([pool.query('select 1'), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 3000))]); } catch (e) { ok = false; } }
      return json(res, ok ? 200 : 503, { ok, uptime: Math.round((Date.now() - START) / 1000), rssMB: Math.round(process.memoryUsage().rss / 1048576), clientes: C.size, usuarios: Object.keys(data.users).length, banco: pool ? 'postgres' : 'arquivo', persistente: !!pool, alertaPersistencia: pool ? null : 'DATABASE_URL não configurada; o arquivo local pode ser perdido em um redeploy.', github: REPO, downloads: fs.existsSync(path.join(__dirname, 'downloads')) ? fs.readdirSync(path.join(__dirname, 'downloads')) : [] });
    }
    if (u === '/') return serve(res, path.join(__dirname, 'public/index.html'));
    if (u === '/app') return serve(res, path.join(__dirname, 'public/app.html'));
    if (u === '/downloads' || u === '/downloads/') return serve(res, path.join(__dirname, 'public/downloads.html'));
    if (u === '/ice') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(process.env.ICE_SERVERS || '[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]'); }
    if (u.startsWith('/downloads/')) {
      const n = path.basename(u);
      if (local(n)) return serve(res, path.join(__dirname, 'downloads', n));
      if (Object.values(FILES).includes(n)) {
        const release = await latestRelease(), asset = release && (release.assets || []).find(a => a.name === n && a.size > 0);
        if (asset) { res.writeHead(302, { Location: asset.browser_download_url }); return res.end(); }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Instalador ainda nao publicado.');
    }
    const base = path.join(__dirname, 'public'), f = path.normalize(path.join(base, u));
    if (!f.startsWith(base)) { res.writeHead(403); return res.end(); }
    serve(res, f);
  } catch (e) { log('error', 'http', 'erro na rota', { rota: req.url.split('?')[0], m: e.message }); if (!res.headersSent) json(res, 500, { erro: 'Erro interno.' }); else res.end(); }
});
srv.keepAliveTimeout = 120000; srv.headersTimeout = 125000; srv.requestTimeout = 0;
/* ---------- websocket ---------- */
const wss = new WebSocketServer({ noServer: true, maxPayload: 262144 }), C = new Map(), recent = new Map(), lastTyping = new Map();
srv.on('upgrade', (req, sock, head) => {
  sock.on('error', () => {});
  const s = req.url.split('?')[0] === '/ws' && sameOrigin(req) ? sess(req) : null;
  if (!s) { sock.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return sock.destroy(); }
  renew(req, null, s);
  wss.handleUpgrade(req, sock, head, ws => { ws.uid = s.uid; ws.sh = s.k; wss.emit('connection', ws, req); });
});
const bc = o => { const s = JSON.stringify(o); C.forEach(c => c.ok && c.ws.readyState === 1 && c.ws.send(s)); };
const peers = () => bc({ t: 'peers', list: [...C.values()].filter(c => c.ok).map(c => ({ peer: c.peer, presence: c.pres })) });
const cleanPres = (p, uid) => { p = p || {}; return { id: uid, vc: VC.includes(p.vc) ? p.vc : null, sh: !!p.sh, cam: !!p.cam, dn: !!p.dn, mic: ['on', 'muted', 'noperm'].includes(p.mic) ? p.mic : 'on', st: ['online', 'away', 'busy'].includes(p.st) ? p.st : 'online', shid: String(p.shid || '').slice(0, 64), cmid: String(p.cmid || '').slice(0, 64) }; };
const findMsg = (c, id) => (data.msgs[c] || []).find(m => m.id === id);
wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => ws.isAlive = true); ws.on('error', () => {});
  C.forEach(o => { if (o.uid === ws.uid) { try { o.ws.send('{"t":"replaced"}'); o.ws.close(4002); } catch (e) {} } }); // uma conexao por usuario
  const c = { ws, uid: ws.uid, sh: ws.sh, peer: crypto.randomBytes(5).toString('hex'), pres: cleanPres({}, ws.uid), ok: true, n: 0, t0: Date.now() };
  C.set(c.peer, c); ws.send(JSON.stringify({ t: 'welcome', peer: c.peer })); peers();
  ws.on('message', raw => {
    if (c.blocked) return;
    if (Date.now() - c.t0 > 5000) { c.t0 = Date.now(); c.n = 0; } if (++c.n > 400) { c.blocked = true; log('warn', 'ws', 'excesso de mensagens', { uid: c.uid }); return ws.close(1008); }
    let m; try { m = JSON.parse(raw); } catch (e) { return; } if (!m || typeof m.t !== 'string') return;
    try { handle(c, ws, m); } catch (e) { log('error', 'ws', 'erro ao tratar mensagem', { tipo: m.t, m: e.message }); }
  });
  ws.on('close', () => { if (C.get(c.peer) === c) { C.delete(c.peer); peers(); } });
});
function handle(c, ws, m) {
  const chan = /^msgs-(geral|jogos|memes)$/;
  if (m.t === 'pres') { c.pres = cleanPres(m.p, c.uid); peers(); }
  else if (m.t === 'emit') { const d = m.data && C.get(m.data.to); if (m.topic === 'sig' && d && c.pres.vc && d.pres.vc === c.pres.vc) d.ws.send(JSON.stringify({ t: 'emit', topic: 'sig', data: m.data, peer: c.peer })); }
  else if (m.t === 'sub') { ws.send(JSON.stringify({ t: 'hist', c: m.c, items: m.c === 'profiles' ? Object.entries(data.profiles).map(([id, d]) => ({ id, d })) : chan.test(m.c) ? (data.msgs[m.c] || []).slice(-100) : [] })); }
  else if (m.t === 'add' && chan.test(m.c) && m.d && typeof m.d.text === 'string' && m.d.text.trim()) {
    const cid = String(m.d.cid || ''), rs = recent.get(c.uid) || recent.set(c.uid, new Set()).get(c.uid);
    if (cid) { if (rs.has(cid)) return; rs.add(cid); if (rs.size > 200) rs.delete(rs.values().next().value); }
    const it = { id: Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), d: { by: c.uid, text: m.d.text.trim().slice(0, 1500), ts: Date.now() } };
    if (m.d.r && findMsg(m.c, String(m.d.r))) it.d.r = String(m.d.r);
    const a = data.msgs[m.c] = data.msgs[m.c] || []; a.push(it); if (a.length > 500) a.shift(); save(); bc({ t: 'doc', c: m.c, id: it.id, d: it.d });
  } else if (m.t === 'edit' && chan.test(m.c)) {
    const it = findMsg(m.c, String(m.id)); if (!it || it.d.by !== c.uid || typeof m.text !== 'string' || !m.text.trim()) return;
    it.d.text = m.text.trim().slice(0, 1500); it.d.edited = true; save(); bc({ t: 'doc', c: m.c, id: it.id, d: it.d });
  } else if (m.t === 'del' && chan.test(m.c)) {
    const it = findMsg(m.c, String(m.id)); if (!it || it.d.by !== c.uid) return;
    data.msgs[m.c] = data.msgs[m.c].filter(x => x !== it); save(); bc({ t: 'del', c: m.c, id: it.id });
  } else if (m.t === 'react' && chan.test(m.c) && EMOJI.includes(m.e)) {
    const it = findMsg(m.c, String(m.id)); if (!it) return; const re = it.d.re = it.d.re || {}, a = re[m.e] = re[m.e] || [], i = a.indexOf(c.uid);
    if (i < 0) { if (a.length < 50) a.push(c.uid); } else a.splice(i, 1); if (!a.length) delete re[m.e]; save(); bc({ t: 'doc', c: m.c, id: it.id, d: it.d });
  } else if (m.t === 'typing' && chan.test(m.c)) {
    const k = c.uid + m.c; if (Date.now() - (lastTyping.get(k) || 0) < 1500) return; lastTyping.set(k, Date.now());
    const s = JSON.stringify({ t: 'typing', c: m.c, uid: c.uid }); C.forEach(o => o !== c && o.ws.readyState === 1 && o.ws.send(s));
  } else if (m.t === 'set' && m.c === 'profiles') {
    const d = m.d || {}, av = String(d.avatar || '');
    const p = { name: String(d.name || 'Sem nome').trim().slice(0, 24) || 'Sem nome', status: String(d.status || '').slice(0, 60), color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#7c3aed',
      avatar: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(av) && av.length < 60000 ? av : '' };
    data.profiles[c.uid] = p; save(); bc({ t: 'doc', c: 'profiles', id: c.uid, d: p });
  }
}
setInterval(() => { wss.clients.forEach(w => { if (!w.isAlive) return w.terminate(); w.isAlive = false; try { w.ping(); } catch (e) {} }); if (lastTyping.size > 500) lastTyping.clear(); }, 25000).unref();
srv.on('error', e => log('error', 'http', 'servidor', { m: e.message }));
/* ---------- encerramento controlado ---------- */
let closing = false;
async function shutdown(sig, code) {
  if (closing) return; closing = true; log('info', 'proc', 'encerrando', { sig });
  setTimeout(() => process.exit(code || 0), 8000).unref();
  srv.close(); C.forEach(c => { try { c.ws.send('{"t":"bye"}'); c.ws.close(1001); } catch (e) {} });
  try { await flushAll(); if (pool) await pool.end(); } catch (e) {}
  process.exit(code || 0);
}
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
load().then(() => srv.listen(PORT, HOST, () => log('info', 'proc', 'Papo no ar', { porta: PORT }))).catch(e => { log('error', 'db', 'falha ao abrir o banco', { m: e.message }); process.exit(1); });

