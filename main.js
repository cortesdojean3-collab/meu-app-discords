const { app, BrowserWindow, session, desktopCapturer, Menu, shell, ipcMain } = require('electron');
const path = require('path'), fs = require('fs');
const store = () => path.join(app.getPath('userData'), 'server.json');
function getBase() {
  const arg = process.argv.find(a => a.startsWith('--server='));
  if (arg) return arg.slice(9).replace(/\/$/, '');
  try { const u = JSON.parse(fs.readFileSync(store())).serverUrl; if (u) return u; } catch (e) {}
  const c = require('./config.json').serverUrl;
  return /^https?:\/\/(?!COLOQUE)/.test(c) ? c.replace(/\/$/, '') : '';
}
let base = getBase(), win;
try { if (base) app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', new URL(base).origin); } catch (e) {}
const setup = () => win.loadFile(path.join(__dirname, 'setup.html'));
const open = () => base ? win.loadURL(base + '/app?desktop=1') : setup();
function create() {
  win = new BrowserWindow({ width: 1280, height: 800, minWidth: 900, minHeight: 600, backgroundColor: '#1e1f22',
    icon: path.join(__dirname, 'build/icon.png'), webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-fail-load', (e, code, d, url, main) => { if (main && !url.startsWith('file:')) setup(); });
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.control && i.shift && i.key.toLowerCase() === 's') setup(); });
  open();
}
ipcMain.on('papo-save', (e, url) => {
  fs.writeFileSync(store(), JSON.stringify({ serverUrl: url }));
  if (url.startsWith('http:')) { app.relaunch(); app.exit(); } else { base = url; open(); }
});
app.whenReady().then(() => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_, p, cb) => cb(['media', 'display-capture', 'fullscreen', 'notifications'].includes(p)));
  ses.setDisplayMediaRequestHandler(async (_, cb) => {
    const src = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
    const items = src.map(s => ({ label: (s.id.startsWith('screen') ? '🖥️ ' : '🪟 ') + s.name.slice(0, 60),
      click: () => cb({ video: s, audio: process.platform === 'win32' ? 'loopback' : undefined }) }));
    items.push({ type: 'separator' }, { label: 'Cancelar', click: () => cb({}) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  create();
});
app.on('window-all-closed', () => app.quit());
