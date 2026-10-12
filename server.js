const http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000, PW = process.env.SERVER_PASSWORD || '';
const DB = process.env.DATA_FILE || path.join(__dirname, 'data.json');
let data = { profiles: {}, msgs: {} }; try { data = JSON.parse(fs.readFileSync(DB)); } catch (e) {}
let tm; const save = () => { clearTimeout(tm); tm = setTimeout(() => fs.writeFile(DB, JSON.stringify(data), () => {}), 1000); };
const MIME = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
process.on('uncaughtException', e => console.error('erro:', e));
function serve(res, file) {
  fs.stat(file, (e, s) => {
    if (e || !s.isFile()) { res.writeHead(404); return res.end('Nao encontrado'); }
    const h = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': s.size };
    if (/\.(exe|dmg|AppImage)$/.test(file)) h['Content-Disposition'] = 'attachment; filename="' + path.basename(file) + '"';
    res.writeHead(200, h);
    fs.createReadStream(file).pipe(res);
  });
}
const srv = http.createServer((req, res) => {
  let u; try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (u === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, clientes: C.size, downloads: fs.existsSync(path.join(__dirname, 'downloads')) ? fs.readdirSync(path.join(__dirname, 'downloads')) : [] })); }
  if (u === '/') return serve(res, path.join(__dirname, 'public/index.html'));
  if (u === '/app') return serve(res, path.join(__dirname, 'public/app.html'));
  if (u === '/ice') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(process.env.ICE_SERVERS || '[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]');
  }
  const dl = u.startsWith('/downloads/'), base = path.join(__dirname, dl ? 'downloads' : 'public');
  const f = path.normalize(path.join(base, dl ? u.slice(10) : u));
  if (!f.startsWith(base)) { res.writeHead(403); return res.end(); }
  serve(res, f);
});
const wss = new WebSocketServer({ server: srv, path: '/ws', maxPayload: 2e6 }), C = new Map();
const bc = o => { const s = JSON.stringify(o); C.forEach(c => c.ok && c.ws.readyState === 1 && c.ws.send(s)); };
const peers = () => bc({ t: 'peers', list: [...C.values()].filter(c => c.ok).map(c => ({ peer: c.peer, presence: c.pres })) });
wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => ws.isAlive = true); ws.on('error', () => {});
  const c = { ws, peer: Math.random().toString(36).slice(2, 10), pres: {}, ok: false, uid: '' }; C.set(c.peer, c);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'hello') {
      if (PW && m.pw !== PW) { ws.send('{"t":"bad"}'); return ws.close(); }
      c.ok = true; c.uid = String(m.uid || '').slice(0, 80);
      ws.send(JSON.stringify({ t: 'welcome', peer: c.peer })); return peers();
    }
    if (!c.ok) return;
    if (m.t === 'pres') { c.pres = m.p; peers(); }
    else if (m.t === 'emit') { const d = m.data && C.get(m.data.to); if (d) d.ws.send(JSON.stringify({ t: 'emit', topic: m.topic, data: m.data, peer: c.peer })); }
    else if (m.t === 'sub') {
      const items = m.c === 'profiles' ? Object.entries(data.profiles).map(([id, d]) => ({ id, d })) : (data.msgs[m.c] || []).slice(-100);
      ws.send(JSON.stringify({ t: 'hist', c: m.c, items }));
    } else if (m.t === 'add' && /^msgs-[a-z0-9]{1,20}$/.test(m.c) && m.d && m.d.text) {
      const it = { id: Date.now() + Math.random().toString(36).slice(2, 6), d: { by: c.uid, text: String(m.d.text).slice(0, 1500), ts: Date.now() } };
      const a = data.msgs[m.c] = data.msgs[m.c] || []; a.push(it); if (a.length > 500) a.shift();
      save(); bc({ t: 'doc', c: m.c, id: it.id, d: it.d });
    } else if (m.t === 'set' && m.c === 'profiles' && c.uid) {
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
srv.listen(PORT, () => console.log('Papo rodando na porta ' + PORT));
