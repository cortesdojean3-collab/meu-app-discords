const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { createStorage } = require('./storage');
const PORT = +process.env.PORT || 3000, HOST = '0.0.0.0', INVITE = process.env.INVITE_CODE || '';
const DEFAULT_REPO = 'cortesdojean3-collab/meu-app-discords';
const configuredRepo = process.env.GITHUB_REPO || DEFAULT_REPO;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(configuredRepo) ? configuredRepo : DEFAULT_REPO;
const DB = process.env.DATA_FILE || path.join(__dirname, 'data.json'), START = Date.now();
const APP_VERSION = require('./package.json').version;
const BUILD_FILES=['server.js','storage.js','migrations/001_persistent_data.sql','migrations/import-legacy.js','main.js','screen-share-selection.js','preload.js','picker-preload.js','picker.html','package.json','public/index.html','public/app.html','public/papo-enhancements.js','public/papo-intro.css','public/papo-intro.js','public/papo-motor.wav','public/kombi.svg','public/sw.js','public/downloads.html','public/papo-ui.css','public/kombi-cursor.svg','public/kombi-cursor-medium.svg','public/papo-surprises.js','public/papo-surprises.css','public/papo-garden.svg','public/kombi-flowers.svg'];
function localBuildId(){const hash=crypto.createHash('sha256');for(const file of BUILD_FILES)hash.update(file).update('\0').update(fs.readFileSync(path.join(__dirname,file)));return hash.digest('hex').slice(0,12)}
const BUILD_ID=process.env.RENDER_GIT_COMMIT||process.env.GITHUB_SHA||localBuildId();
const FILES = { win: 'Papo-win.exe', mac: 'Papo-mac.dmg', linux: 'Papo-linux.AppImage' };
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.js': 'text/javascript', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const VC = ['voz1', 'voz2'], EMOJI = ['👍', '❤️', '😂', '🎉', '😮'], DAY = 864e5, TTL_SHORT = 12 * 36e5, TTL_LONG = 30 * DAY;
const log = (l, ctx, msg, x) => (l === 'error' ? console.error : console.log)(JSON.stringify({ t: new Date().toISOString(), l, ctx, msg, ...x }));
const TEMP = /ECONNRESET|EPIPE|ETIMEDOUT|ERR_STREAM|socket hang up|ECONNABORTED/;
process.on('uncaughtException', e => { if (TEMP.test((e.code || '') + e.message)) return log('warn', 'proc', 'erro de rede ignorado', { m: e.message }); log('error', 'proc', 'erro fatal', { m: e.message, s: (e.stack || '').split('\n')[1] }); shutdown('fatal', 1); });
process.on('unhandledRejection', e => log('error', 'proc', 'promise rejeitada', { m: String((e && e.message) || e) }));
/* ---------- persistência: Postgres relacional ou arquivo local ---------- */
const storage = createStorage({ databaseUrl: process.env.DATABASE_URL, dataFile: DB, legacyDataFile: process.env.LEGACY_DATA_FILE });
let data = {}, tm, flushing = false, again = false;
async function load() {
  data = await storage.load();
  if (!storage.persistent) log('warn', 'db', 'DATABASE_URL não configurada; arquivo local pode ser perdido em novo deploy');
}
async function flush() {
  if (flushing) { again = true; return; } flushing = true;
  try {
    await storage.save(data);
  } catch (e) { log('error', 'db', 'falha ao salvar', { m: e.message }); throw e; }
  finally { flushing = false; if (again) { again = false; await flush(); } }
}
const save = () => { clearTimeout(tm); tm = setTimeout(() => flush().catch(() => {}), 800); };
const flushAll = async () => { clearTimeout(tm); while (flushing) await new Promise(r => setTimeout(r, 10)); await flush(); };
/* ---------- sessoes (cookie HttpOnly) e contas ---------- */
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const sh = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const PASSWORD_PREFIX = 'scrypt$65536$8$2$';
const scrypt = (p, s, legacy = false) => new Promise((ok, no) => crypto.scrypt(p, s, 64, legacy ? {} : { N:65536,r:8,p:2,maxmem:96*1024*1024 }, (e, k) => e ? no(e) : ok(k.toString('hex'))));
const passwordHash = async (p, s) => PASSWORD_PREFIX + await scrypt(p, s);
async function passwordMatches(pass, user) {
  const encoded = typeof user?.hash === 'string' ? user.hash : '';
  const legacy = /^[a-f0-9]{128}$/i.test(encoded);
  const expected = legacy ? encoded : encoded.startsWith(PASSWORD_PREFIX) ? encoded.slice(PASSWORD_PREFIX.length) : '';
  const actual = await scrypt(pass, typeof user?.salt === 'string' ? user.salt : 'x'.repeat(32), legacy);
  return !!user && /^[a-f0-9]{128}$/i.test(expected) && crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));
}
const cookie = (req, n) => { const m = (req.headers.cookie || '').split(/;\s*/).find(x => x.startsWith(n + '=')); return m ? m.slice(n.length + 1) : ''; };
const secure = req => req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
function setCookie(req, res, sid, remember, clear) {
  res.setHeader('Set-Cookie', `papo_sid=${clear ? '' : sid}; Path=/; HttpOnly; SameSite=Lax${secure(req) ? '; Secure' : ''}${clear ? '; Max-Age=0' : remember ? '; Max-Age=' + TTL_LONG / 1000 : ''}`);
}
async function sess(req) {
  const token = cookie(req, 'papo_sid');
  if (!token) return null;
  const k = sh(token), s = storage.persistent ? await storage.readSession(k) : data.sessions[k];
  if (storage.persistent) { if (s) data.sessions[k] = s; else delete data.sessions[k]; }
  if (!s) return null;
  if (s.exp < Date.now()) { if(storage.persistent)await storage.revokeSession(k);delete data.sessions[k];if(!storage.persistent)save();return null; }
  return Object.assign({ k }, s);
}
async function renew(req, res, s) {
  const ttl = s.remember ? TTL_LONG : TTL_SHORT;
  if (s.exp - Date.now() < ttl / 2) { const previous=data.sessions[s.k].exp;data.sessions[s.k].exp=Date.now()+ttl;try{await flushAll()}catch(error){data.sessions[s.k].exp=previous;throw error}if(res)setCookie(req,res,cookie(req,'papo_sid'),s.remember); }
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
  const key = sh(sid);
  data.sessions[key] = { uid, remember, exp: Date.now() + (remember ? TTL_LONG : TTL_SHORT), ts: Date.now(), ua: String(req.headers['user-agent'] || '').slice(0, 70) };
  return flushAll().then(() => setCookie(req, res, sid, remember)).catch(error => { delete data.sessions[key]; throw error; });
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
    if ((storage.persistent ? await storage.readUser(key) : data.users[key]) || inflight.has(key)) return json(res, 409, { erro: 'Esse usuário já existe.' });
    inflight.add(key);
    try {
      const salt = crypto.randomBytes(16).toString('hex'), h = await passwordHash(pass, salt);
      if (data.users[key]) return json(res, 409, { erro: 'Esse usuário já existe.' });
      const uid = crypto.randomUUID();
      data.users[key] = { uid, salt, hash: h, name, createdAt: Date.now() };
      data.profiles[uid] = { name, status: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], avatar: '' };
      try { await flushAll(); } catch (error) { delete data.users[key]; delete data.profiles[uid]; return json(res, 503, { erro: 'Não foi possível salvar sua conta. Verifique a conexão e tente novamente.' }); }
      bc({ t: 'doc', c: 'profiles', id: uid, d: data.profiles[uid] });
      try { await newSession(req,res,uid,!!b.remember); } catch(error) { return json(res,503,{erro:'A conta foi salva, mas não foi possível abrir a sessão. Tente entrar novamente.'}); } log('info', 'auth', 'conta criada', { uid });
      return json(res, 200, { uid, name });
    } finally { inflight.delete(key); }
  }
  if (pass.length > 100) return json(res,400,{erro:'A senha excedeu o limite de 100 caracteres.'});
  const u = storage.persistent ? await storage.readUser(key) : data.users[key];
  if (!await passwordMatches(pass,u)) return json(res, 401, { erro: 'Usuário ou senha incorretos.' });
  data.users[key]=u;
  if (!u.hash.startsWith(PASSWORD_PREFIX)) { const previous=u.hash;u.hash=await passwordHash(pass,u.salt);try{await flushAll()}catch(error){u.hash=previous;return json(res,503,{erro:'Não foi possível atualizar a proteção da conta. Tente novamente.'})} }
  try { await newSession(req,res,u.uid,!!b.remember); } catch(error) { return json(res,503,{erro:'Não foi possível salvar a sessão. Tente novamente.'}); } json(res, 200, { uid: u.uid, name: u.name });
}
async function dropSessions(uid, keep) { if(storage.persistent)await storage.revokeOtherSessions(uid,keep);const removed=[];for(const k in data.sessions)if(data.sessions[k].uid===uid&&k!==keep){removed.push([k,data.sessions[k]]);delete data.sessions[k]}if(!storage.persistent)try{await flushAll()}catch(error){removed.forEach(([k,v])=>data.sessions[k]=v);throw error}C.forEach(c=>{if(c.uid===uid&&c.sh!==keep)try{c.ws.close(4001)}catch{}}); }
async function api(req, res, u) {
  if (req.method === 'POST' && !sameOrigin(req)) return json(res, 403, { erro: 'Origem não permitida.' });
  if (u === '/api/login' || u === '/api/register') return req.method === 'POST' ? auth(req, res, u === '/api/register') : json(res, 405, {});
  const s = await sess(req);
  if (u === '/api/me') { if (!s) return json(res, 401, { erro: 'Sessão expirada.' }); await renew(req, res, s); return json(res, 200, { uid: s.uid }); }
  if (!s) return json(res, 401, { erro: 'Sessão expirada.' });
  if (u === '/api/logout' && req.method === 'POST') { const session=data.sessions[s.k];delete data.sessions[s.k];try{if(storage.persistent)await storage.revokeSession(s.k);else await flushAll()}catch(error){data.sessions[s.k]=session;return json(res,503,{erro:'Não foi possível encerrar a sessão. Tente novamente.'})}C.forEach(c=>{if(c.sh===s.k)try{c.ws.close(4001)}catch{}});setCookie(req,res,'',false,true);return json(res,200,{}); }
  if (u === '/api/sessions') { const sessions=storage.persistent?await storage.listSessions(s.uid):Object.entries(data.sessions).filter(([,v])=>v.uid===s.uid&&v.exp>Date.now());return json(res,200,sessions.map(([k,v])=>({ua:v.ua||'Dispositivo',ts:v.ts,current:k===s.k}))); }
  if (u === '/api/sessions/revoke-others' && req.method === 'POST') { try { await dropSessions(s.uid, s.k); return json(res, 200, {}); } catch (error) { return json(res,503,{erro:'Não foi possível encerrar as outras sessões. Tente novamente.'}); } }
  if (u === '/api/delete' && req.method === 'POST') {
    const b = await readJson(req), me = Object.entries(data.users).find(([, v]) => v.uid === s.uid);
    if (!me || !await passwordMatches(String(b.pass || ''),me[1])) return json(res, 401, { erro: 'Senha incorreta.' });
    const before=data; data=JSON.parse(JSON.stringify(data));
    delete data.users[me[0]]; delete data.profiles[s.uid];
    for (const c in data.msgs) data.msgs[c] = data.msgs[c].filter(m => m.d.by !== s.uid);
    for (const k in data.sessions) if(data.sessions[k].uid===s.uid) delete data.sessions[k];
    try { await flushAll(); } catch (error) { data=before; return json(res,503,{erro:'Não foi possível excluir a conta agora. Tente novamente.'}); }
    C.forEach(c => { if (c.uid === s.uid) try { c.ws.close(4001); } catch (e) {} });
    setCookie(req, res, '', false, true); bc({ t: 'doc', c: 'profiles', id: s.uid, d: null }); log('info', 'auth', 'conta excluida', { uid: s.uid });
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
async function iceConfig(req,res){
  res.setHeader('Cache-Control','private, no-store');
  const servers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}],s=await sess(req);
  const urls=(process.env.TURN_URLS||'').split(',').map(x=>x.trim()).filter(x=>/^turns?:[^\s,]+$/i.test(x));
  const secret=process.env.TURN_SECRET||'';
  if(s){await renew(req,res,s);if(urls.length&&secret){const username=`${Math.floor(Date.now()/1000)+3600}:${s.uid}`;const credential=crypto.createHmac('sha1',secret).update(username).digest('base64');servers.push({urls,username,credential})}}
  return json(res,200,servers);
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
function serveApp(res,file){fs.readFile(file,'utf8',(e,html)=>{if(e)return serve(res,file);const body=html.replaceAll('__PAPO_BUILD_ID__',BUILD_ID);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store'});res.end(body)})}
const srv = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options','DENY'); res.setHeader('Content-Security-Policy',"frame-ancestors 'none'"); res.setHeader('Permissions-Policy','camera=(self), microphone=(self), display-capture=(self)');
  try {
    let u; try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
    if (u.startsWith('/api/')) { if (u === '/api/downloads') return json(res, 200, await avail()); if (u === '/api/version') { res.setHeader('Cache-Control','no-store'); return json(res,200,{version:APP_VERSION,build:BUILD_ID}); } return await api(req, res, u); }
    if (u === '/health') {
      let ok = true; if (storage.persistent) { try { await Promise.race([storage.health(), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 3000))]); } catch (e) { ok = false; } }
      return json(res, ok ? 200 : 503, { ok, uptime: Math.round((Date.now() - START) / 1000), rssMB: Math.round(process.memoryUsage().rss / 1048576), clientes: C.size, usuarios: Object.keys(data.users).length, banco: storage.persistent ? 'postgres' : 'arquivo', persistente: storage.persistent, alertaPersistencia: storage.persistent ? null : 'DATABASE_URL não configurada; o arquivo local pode ser perdido em um redeploy.', github: REPO, downloads: fs.existsSync(path.join(__dirname, 'downloads')) ? fs.readdirSync(path.join(__dirname, 'downloads')) : [] });
    }
    if (u === '/') return serve(res, path.join(__dirname, 'public/index.html'));
    if (u === '/app') return serveApp(res, path.join(__dirname, 'public/app.html'));
    if (u === '/downloads' || u === '/downloads/') return serve(res, path.join(__dirname, 'public/downloads.html'));
    if (u === '/ice') { if(!sameOrigin(req))return json(res,403,{erro:'Origem não permitida.'}); return await iceConfig(req,res); }
    if (u.startsWith('/downloads/')) {
      const n = path.basename(u);
      if (local(n)) return serve(res, path.join(__dirname, 'downloads', n));
      if (Object.values(FILES).includes(n)) {
        const release = await latestRelease(), asset = release && (release.assets || []).find(a => a.name === n && a.size > 0);
        if (asset) { res.writeHead(302, { Location: asset.browser_download_url }); return res.end(); }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Instalador ainda nao publicado.');
    }
    const base = path.resolve(__dirname, 'public'), f = path.resolve(base, '.' + u), rel = path.relative(base, f);
    if (rel.startsWith('..'+path.sep) || rel === '..' || path.isAbsolute(rel)) { res.writeHead(403); return res.end(); }
    serve(res, f);
  } catch (e) { log('error', 'http', 'erro na rota', { rota: req.url.split('?')[0], m: e.message }); if (!res.headersSent) json(res, 500, { erro: 'Erro interno.' }); else res.end(); }
});
srv.keepAliveTimeout = 120000; srv.headersTimeout = 125000; srv.requestTimeout = 0;
/* ---------- websocket ---------- */
const wss = new WebSocketServer({ noServer: true, maxPayload: 262144 }), C = new Map(), recent = new Map(), pendingMessages = new Map(), lastTyping = new Map();
srv.on('upgrade', async (req, sock, head) => {
  sock.on('error', () => {});
  let s;try{s=req.url.split('?')[0]==='/ws'&&sameOrigin(req)?await sess(req):null;if(s)await renew(req,null,s)}catch(error){sock.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return sock.destroy()}
  if (!s) { sock.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return sock.destroy(); }
  wss.handleUpgrade(req, sock, head, ws => { ws.uid = s.uid; ws.sh = s.k; wss.emit('connection', ws, req); });
});
const bc = o => { const s = JSON.stringify(o); C.forEach(c => c.ok && c.ws.readyState === 1 && c.ws.send(s)); };
const peers = () => bc({ t: 'peers', list: [...C.values()].filter(c => c.ok).map(c => ({ peer: c.peer, presence: c.pres })) });
const cleanPres = (p, uid) => { p = p || {}; return { id: uid, vc: VC.includes(p.vc) ? p.vc : null, sh: !!p.sh, cam: !!p.cam, dn: !!p.dn, mic: ['on', 'muted', 'noperm'].includes(p.mic) ? p.mic : 'on', st: ['online', 'away', 'busy', 'invisible'].includes(p.st) ? p.st : 'online', shid: String(p.shid || '').slice(0, 64), cmid: String(p.cmid || '').slice(0, 64) }; };
const findMsg = (c, id) => (data.msgs[c] || []).find(m => m.id === id);
wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => ws.isAlive = true); ws.on('error', () => {});
  C.forEach(o => { if (o.uid === ws.uid) { try { o.ws.send('{"t":"replaced"}'); o.ws.close(4002); } catch (e) {} } }); // uma conexao por usuario
  const c = { ws, uid: ws.uid, sh: ws.sh, peer: crypto.randomBytes(5).toString('hex'), pres: cleanPres({}, ws.uid), ok: true, n: 0, t0: Date.now(), giftAt: 0 };
  C.set(c.peer, c); ws.send(JSON.stringify({ t: 'welcome', peer: c.peer })); peers();
  ws.on('message', raw => {
    if (c.blocked) return;
    if (Date.now() - c.t0 > 5000) { c.t0 = Date.now(); c.n = 0; } if (++c.n > 400) { c.blocked = true; log('warn', 'ws', 'excesso de mensagens', { uid: c.uid }); return ws.close(1008); }
    let m; try { m = JSON.parse(raw); } catch (e) { return; } if (!m || typeof m.t !== 'string') return;
    handle(c, ws, m).catch(e => { log('error', 'ws', 'erro ao tratar mensagem', { tipo: m.t, m: e.message }); if (m.rid) ws.send(JSON.stringify({ t:'ack', rid:m.rid, ok:false, erro:'Não foi possível salvar os dados. Verifique a conexão e tente novamente.' })); });
  });
  ws.on('close', () => { if (C.get(c.peer) === c) { C.delete(c.peer); peers(); } });
});
async function authorizeSocket(c, ws) {
  if (!c.ok || ws.readyState !== 1) return false;
  const session = storage.persistent ? await storage.readSession(c.sh) : data.sessions[c.sh];
  if (!session || session.uid !== c.uid || session.exp <= Date.now()) { c.ok = false; ws.close(4001); return false; }
  return true;
}
async function handle(c, ws, m) {
  if (!await authorizeSocket(c, ws)) return;
  const ack=(ok,erro)=>{if(typeof m.rid==='string'&&m.rid.length<=80)ws.send(JSON.stringify({t:'ack',rid:m.rid,ok,...(erro?{erro}:{})}))};
  const chan = /^msgs-(geral|jogos|memes)$/;
  if (m.t === 'pres') { c.pres = cleanPres(m.p, c.uid); peers(); }
  else if (m.t === 'emit') { const payload=m.data, d=payload&&typeof payload.to==='string'&&payload.to.length<=32?C.get(payload.to):null; const sig=payload&&((payload.k==='c'&&payload.c&&typeof payload.c.candidate==='string'&&payload.c.candidate.length<=8192)||(payload.k==='d'&&typeof payload.id==='string'&&/^[a-z0-9_-]{1,32}$/i.test(payload.id)&&Number.isInteger(payload.n)&&payload.n>0&&payload.n<=64&&Number.isInteger(payload.i)&&payload.i>=0&&payload.i<payload.n&&typeof payload.s==='string'&&payload.s.length<=2400)); if(m.topic==='sig'&&sig&&d&&c.pres.vc&&d.pres.vc===c.pres.vc)d.ws.send(JSON.stringify({t:'emit',topic:'sig',data:payload,peer:c.peer})); }
  else if (m.t === 'gift') {
    const target = String(m.to || '');
    if (!c.pres.vc || target === c.uid || Date.now() - c.giftAt < 1000) return;
    if (![...C.values()].some(x => x.uid === target && x.pres.vc === c.pres.vc)) return;
    c.giftAt = Date.now();
    const event = JSON.stringify({ t: 'gift', from: c.uid, to: target, id: crypto.randomBytes(8).toString('hex'), at: Date.now() });
    C.forEach(x => { if (x.ok && x.pres.vc === c.pres.vc && x.ws.readyState === 1) x.ws.send(event); });
  }
  else if (m.t === 'sub') { ws.send(JSON.stringify({ t: 'hist', c: m.c, items: m.c === 'profiles' ? Object.entries(data.profiles).map(([id, d]) => ({ id, d })) : chan.test(m.c) ? (data.msgs[m.c] || []).slice(-100) : [] })); }
  else if (m.t === 'add' && chan.test(m.c) && m.d && typeof m.d.text === 'string' && m.d.text.trim()) {
    const cid = String(m.d.cid || ''), rs = recent.get(c.uid) || recent.set(c.uid, new Set()).get(c.uid);
    const pendingKey=cid?c.uid+':'+cid:'';
    if (cid) { if (rs.has(cid)) { ack(true); return; } if(pendingMessages.has(pendingKey)){const saved=await pendingMessages.get(pendingKey);ack(saved,saved?undefined:'Não foi possível salvar os dados. Tente novamente.');return;} }
    let resolvePending; if(cid)pendingMessages.set(pendingKey,new Promise(resolve=>resolvePending=resolve));
    let saved=false;
    const it = { id: Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), d: { by: c.uid, text: m.d.text.trim().slice(0, 1500), ts: Date.now() } };
    if (m.d.r && findMsg(m.c, String(m.d.r))) it.d.r = String(m.d.r);
    const a = data.msgs[m.c] = data.msgs[m.c] || []; a.push(it); const dropped=a.length>500?a.shift():null; try { await flushAll(); if(cid){rs.add(cid);if(rs.size>200)rs.delete(rs.values().next().value)} bc({ t: 'doc', c: m.c, id: it.id, d: it.d }); saved=true; ack(true); } catch(e) { a.pop(); if(dropped)a.unshift(dropped); throw e; } finally { if(cid){pendingMessages.delete(pendingKey);resolvePending(saved)} }
  } else if (m.t === 'edit' && chan.test(m.c)) {
    const it = findMsg(m.c, String(m.id)); if (!it || it.d.by !== c.uid || typeof m.text !== 'string' || !m.text.trim()) return;
    const old=JSON.stringify(it.d); it.d.text = m.text.trim().slice(0, 1500); it.d.edited = true; try { await flushAll(); } catch(e) { it.d=JSON.parse(old); throw e; } bc({ t: 'doc', c: m.c, id: it.id, d: it.d }); ack(true);
  } else if (m.t === 'del' && chan.test(m.c)) {
    const it = findMsg(m.c, String(m.id)); if (!it || it.d.by !== c.uid) return;
    const items=data.msgs[m.c], index=items.indexOf(it); data.msgs[m.c] = items.filter(x => x !== it); try { await flushAll(); } catch(e) { data.msgs[m.c].splice(index,0,it); throw e; } bc({ t: 'del', c: m.c, id: it.id }); ack(true);
  } else if (m.t === 'react' && chan.test(m.c) && EMOJI.includes(m.e)) {
    const it = findMsg(m.c, String(m.id)); if (!it) return; const re = it.d.re = it.d.re || {}, a = re[m.e] = re[m.e] || [], i = a.indexOf(c.uid);
    const old=JSON.stringify(it.d); if (i < 0) { if (a.length < 50) a.push(c.uid); } else a.splice(i, 1); if (!a.length) delete re[m.e]; try { await flushAll(); } catch(e) { it.d=JSON.parse(old); throw e; } bc({ t: 'doc', c: m.c, id: it.id, d: it.d }); ack(true);
  } else if (m.t === 'typing' && chan.test(m.c)) {
    if (c.pres.st === 'invisible') return;
    const k = c.uid + m.c; if (Date.now() - (lastTyping.get(k) || 0) < 1500) return; lastTyping.set(k, Date.now());
    const s = JSON.stringify({ t: 'typing', c: m.c, uid: c.uid }); C.forEach(o => o !== c && o.ws.readyState === 1 && o.ws.send(s));
  } else if (m.t === 'set' && m.c === 'profiles') {
    const d = m.d || {}, av = String(d.avatar || '');
    const p = { name: String(d.name || 'Sem nome').trim().slice(0, 24) || 'Sem nome', status: String(d.status || '').slice(0, 60), bio: String(d.bio || '').trim().slice(0, 160), color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#7c3aed',
      avatar: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(av) && av.length < 60000 ? av : '' };
    const old=data.profiles[c.uid]; data.profiles[c.uid] = p; try { await flushAll(); } catch(e) { if(old)data.profiles[c.uid]=old;else delete data.profiles[c.uid]; throw e; } bc({ t: 'doc', c: 'profiles', id: c.uid, d: p });
    if(m.rid) ws.send(JSON.stringify({t:'ack',rid:m.rid,ok:true}));
  }
}
setInterval(() => { wss.clients.forEach(w => { if (!w.isAlive) return w.terminate(); w.isAlive = false; try { w.ping(); } catch (e) {} }); C.forEach(c => { if (c.ok) authorizeSocket(c,c.ws).catch(() => { c.ok=false;c.ws.close(1013); }); }); if (lastTyping.size > 500) lastTyping.clear(); }, 25000).unref();
srv.on('error', e => log('error', 'http', 'servidor', { m: e.message }));
/* ---------- encerramento controlado ---------- */
let closing = false;
async function shutdown(sig, code) {
  if (closing) return; closing = true; log('info', 'proc', 'encerrando', { sig });
  setTimeout(() => process.exit(code || 0), 8000).unref();
  srv.close(); C.forEach(c => { try { c.ws.send('{"t":"bye"}'); c.ws.close(1001); } catch (e) {} });
   try { await flushAll(); await storage.close(); } catch (e) {}
  process.exit(code || 0);
}
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
load().then(() => srv.listen(PORT, HOST, () => log('info', 'proc', 'Papo no ar', { porta: PORT }))).catch(e => { log('error', 'db', 'falha ao abrir o banco', { m: e.message }); process.exit(1); });

