const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000, INVITE = process.env.INVITE_CODE || '', REPO = process.env.GITHUB_REPO || '';
const DB = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const FILES = { win: 'Papo-win.exe', mac: 'Papo-mac.dmg', linux: 'Papo-linux.AppImage' };
const MIME = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
process.on('uncaughtException', e => console.error('erro:', e));
/* ---------- banco de dados: Postgres (DATABASE_URL) ou arquivo ---------- */
let data = {}, pool = null, tm;
async function load() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg'); const url = process.env.DATABASE_URL;
    pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
    await pool.query('create table if not exists kv(k text primary key, v jsonb not null)');
    const r = await pool.query("select v from kv where k='main'"); if (r.rows[0]) data = r.rows[0].v;
  } else { try { data = JSON.parse(fs.readFileSync(DB)); } catch (e) {} }
  for (const k of ['users', 'profiles', 'msgs', 'tokens']) data[k] = data[k] || {};
}
const flush = () => pool
  ? pool.query("insert into kv(k,v) values('main',$1) on conflict(k) do update set v=excluded.v", [JSON.stringify(data)]).catch(e => console.error('db:', e.message))
  : fs.writeFile(DB, JSON.stringify(data), () => {});
const save = () => { clearTimeout(tm); tm = setTimeout(flush, 800); };
/* ---------- contas ---------- */
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const hash = (p, salt) => crypto.scryptSync(p, salt, 64).toString('hex');
const tries = {};
const limited = ip => { const x = tries[ip] = tries[ip] || { n: 0, t: Date.now() }; if (Date.now() - x.t > 600000) { x.n = 0; x.t = Date.now(); } return ++x.n > 25; };
const COLORS = ['#7c3aed', '#2563eb', '#db2777', '#059669', '#d97706', '#0891b2'];
function body(req, cb) { let b = ''; req.on('data', d => { b += d; if (b.length > 4000) req.destroy(); }); req.on('end', () => { try { cb(JSON.parse(b)); } catch (e) { cb({}); } }); }
function auth(req, res, reg) {
  body(req, b => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0];
    if (limited(ip)) return json(res, 429, { erro: 'Muitas tentativas. Espere alguns minutos.' });
    const name = String(b.user || '').trim(), key = name.toLowerCase(), pass = String(b.pass || '');
    if (reg) {
      if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(name)) return json(res, 400, { erro: 'Usuário: 3 a 20 letras, números, _ . -' });
      if (pass.length < 6) return json(res, 400, { erro: 'A senha precisa ter pelo menos 6 caracteres.' });
      if (INVITE && b.invite !== INVITE) return json(res, 403, { erro: 'Código de convite incorreto.' });
      if (data.users[key]) return json(res, 409, { erro: 'Esse usuário já existe.' });
      const salt = crypto.randomBytes(16).toString('hex'), uid = crypto.randomUUID();
      data.users[key] = { uid, salt, hash: hash(pass, salt), name };
      data.profiles[uid] = { name, status: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], avatar: '' };
      bc({ t: 'doc', c: 'profiles', id: uid, d: data.profiles[uid] });
    }
    const u = data.users[key];
    if (!u || !crypto.timingSafeEqual(Buffer.from(hash(pass, u.salt)), Buffer.from(u.hash))) return json(res, 401, { erro: 'Usuário ou senha incorretos.' });
    const token = crypto.randomBytes(24).toString('hex'); data.tokens[token] = u.uid; save();
    json(res, 200, { token, uid: u.uid });
  });
}
/* ---------- downloads (arquivo local ou GitHub Releases) ---------- */
const rc = {};
const remote = name => new Promise(r => {
  const c = rc[name]; if (c && Date.now() - c.t < 300000) return r(c.v);
  const q = https.request({ method: 'HEAD', host: 'github.com', path: `/${REPO}/releases/latest/download/${name}`, timeout: 5000 }, x => { const v = x.statusCode >= 300 && x.statusCode < 400; rc[name] = { v, t: Date.now() }; r(v); x.resume(); });
  q.on('error', () => r(false)); q.on('timeout', () => { q.destroy(); r(false); }); q.end();
});
const local = n => fs.existsSync(path.join(__dirname, 'downloads', n));
async function avail() { const o = {}; for (const [k, n] of Object.entries(FILES)) o[k] = local(n) || (REPO ? await remote(n) : false); return o; }
/* ---------- http ---------- */
function serve(res, file) {
  fs.stat(file, (e, s) => {
    if (e || !s.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nao encontrado'); }
    const h = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': s.size };
    if (/\.(exe|dmg|AppImage)$/.test(file)) h['Content-Disposition'] = 'attachment; filename="' + path.basename(file) + '"';
    res.writeHead(200, h); fs.createReadStream(file).pipe(res);
  });
}
const srv = http.createServer(async (req, res) => {
  let u; try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (req.method === 'POST' && (u === '/api/login' || u === '/api/register')) return auth(req, res, u === '/api/register');
  if (u === '/api/downloads') return json(res, 200, await avail());
  if (u === '/health') return json(res, 200, { ok: true, clientes: C.size, banco: pool ? 'postgres' : 'arquivo', usuarios: Object.keys(data.users).length, github: REPO || null, downloads: fs.existsSync(path.join(__dirname, 'downloads')) ? fs.readdirSync(path.join(__dirname, 'downloads')) : [] });
  if (u === '/') return serve(res, path.join(__dirname, 'public/index.html'));
  if (u === '/app') return serve(res, path.join(__dirname, 'public/app.html'));
  if (u === '/ice') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(process.env.ICE_SERVERS || '[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]'); }
  if (u.startsWith('/downloads/')) {
    const n = path.basename(u);
    if (local(n)) return serve(res, path.join(__dirname, 'downloads', n));
    if (REPO && Object.values(FILES).includes(n)) { res.writeHead(302, { Location: `https://github.com/${REPO}/releases/latest/download/${n}` }); return res.end(); }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Instalador ainda nao publicado.');
  }
  const base = path.join(__dirname, 'public'), f = path.normalize(path.join(base, u));
  if (!f.startsWith(base)) { res.writeHead(403); return res.end(); }
  serve(res, f);
});
/* ---------- websocket ---------- */
const wss = new WebSocketServer({ server: srv, path: '/ws', maxPayload: 2e6 }), C = new Map();
const bc = o => { const s = JSON.stringify(o); C.forEach(c => c.ok && c.ws.readyState === 1 && c.ws.send(s)); };
const peers = () => bc({ t: 'peers', list: [...C.values()].filter(c => c.ok).map(c => ({ peer: c.peer, presence: c.pres })) });
wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => ws.isAlive = true); ws.on('error', () => {});
  const c = { ws, peer: Math.random().toString(36).slice(2, 10), pres: {}, ok: false, uid: '' }; C.set(c.peer, c);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'hello') {
      const uid = data.tokens[m.token];
      if (!uid) { ws.send('{"t":"bad"}'); return ws.close(); }
      c.ok = true; c.uid = uid; ws.send(JSON.stringify({ t: 'welcome', peer: c.peer })); return peers();
    }
    if (!c.ok) return;
    if (m.t === 'pres') { c.pres = Object.assign({}, m.p, { id: c.uid }); peers(); }
    else if (m.t === 'emit') { const d = m.data && C.get(m.data.to); if (d) d.ws.send(JSON.stringify({ t: 'emit', topic: m.topic, data: m.data, peer: c.peer })); }
    else if (m.t === 'sub') {
      const items = m.c === 'profiles' ? Object.entries(data.profiles).map(([id, d]) => ({ id, d })) : (data.msgs[m.c] || []).slice(-100);
      ws.send(JSON.stringify({ t: 'hist', c: m.c, items }));
    } else if (m.t === 'add' && /^msgs-[a-z0-9]{1,20}$/.test(m.c) && m.d && m.d.text) {
      const it = { id: Date.now() + Math.random().toString(36).slice(2, 6), d: { by: c.uid, text: String(m.d.text).slice(0, 1500), ts: Date.now() } };
      const a = data.msgs[m.c] = data.msgs[m.c] || []; a.push(it); if (a.length > 500) a.shift();
      save(); bc({ t: 'doc', c: m.c, id: it.id, d: it.d });
    } else if (m.t === 'set' && m.c === 'profiles') {
      const d = m.d || {}, av = String(d.avatar || '');
      const p = { name: String(d.name || 'Sem nome').slice(0, 24), status: String(d.status || '').slice(0, 60),
        color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#7c3aed', avatar: av.startsWith('data:image/') && av.length < 60000 ? av : '' };
      data.profiles[c.uid] = p; save(); bc({ t: 'doc', c: 'profiles', id: c.uid, d: p });
    }
  });
  ws.on('close', () => { C.delete(c.peer); peers(); });
});
setInterval(() => wss.clients.forEach(w => { if (!w.isAlive) return w.terminate(); w.isAlive = false; try { w.ping(); } catch (e) {} }), 25000);
srv.on('error', e => console.error('http:', e));
load().then(() => srv.listen(PORT, () => console.log('Papo rodando na porta ' + PORT))).catch(e => { console.error('Falha ao abrir o banco:', e.message); process.exit(1); });
