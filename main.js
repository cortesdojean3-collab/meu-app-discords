const { app, BrowserWindow, session, desktopCapturer, shell, ipcMain } = require('electron');
const path = require('path'), fs = require('fs'), { fileURLToPath } = require('url');
const { autoUpdater } = require('electron-updater');
const { createScreenShareSelection } = require('./screen-share-selection');
const store = () => path.join(app.getPath('userData'), 'server.json');
function getBase() {
  const arg = process.argv.find(a => a.startsWith('--server='));
  if (arg) return arg.slice(9).replace(/\/$/, '');
  try { const u = JSON.parse(fs.readFileSync(store())).serverUrl; if (u) return u; } catch (error) { console.warn('[papo] URL salva indisponível:', error.message); }
  const c = require('./config.json').serverUrl;
  return /^https?:\/\/(?!COLOQUE)/.test(c) ? c.replace(/\/$/, '') : '';
}
let base = getBase(), win;
let updateState = { state: 'unsupported' }, updateCheckInFlight = false, updateRetryMs = 5 * 60 * 1000, updateRetryTimer = null;
function trustedOrigin(value) { try { return !!base && new URL(value).origin === new URL(base).origin } catch { return false } }
function trustedAppFrame(event) { return event.sender === win?.webContents && trustedOrigin(event.senderFrame?.url) }
function setupUrl(value) {
  try { return fileURLToPath(value) === path.resolve(__dirname, 'setup.html'); }
  catch { return false; }
}
function setupFrame(event) {
  return event.sender === win?.webContents && setupUrl(event.senderFrame?.url);
}
function publishUpdateState(state, info = {}) {
  const safeInfo = {};
  if (Number.isFinite(info.percent)) safeInfo.percent = Math.max(0, Math.min(100, info.percent));
  if (Number.isFinite(info.transferred)) safeInfo.transferred = Math.max(0, info.transferred);
  if (Number.isFinite(info.total)) safeInfo.total = Math.max(0, info.total);
  if (typeof info.version === 'string') safeInfo.version = info.version.slice(0, 40);
  updateState = { state, ...safeInfo };
  if (win && !win.isDestroyed()) win.webContents.send('papo:update-state', updateState);
}
function scheduleUpdateRetry() {
  if (!app.isPackaged) return;
  if (updateRetryTimer) return;
  updateRetryTimer = setTimeout(() => { updateRetryTimer = null; checkForUpdate(); }, updateRetryMs);
  updateRetryTimer.unref?.();
  updateRetryMs = Math.min(updateRetryMs * 2, 60 * 60 * 1000);
}
function clearUpdateRetry() { clearTimeout(updateRetryTimer); updateRetryTimer = null; updateRetryMs = 5 * 60 * 1000; }
async function checkForUpdate() {
  if (!app.isPackaged) { publishUpdateState('unsupported'); return }
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  publishUpdateState('checking');
  try { await autoUpdater.checkForUpdates() }
  catch (error) {
    console.error('[papo] Falha ao consultar atualizações:', error);
    publishUpdateState('error');
    scheduleUpdateRetry();
  } finally { updateCheckInFlight = false; }
}
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowPrerelease = false;
autoUpdater.on('checking-for-update', () => publishUpdateState('checking'));
autoUpdater.on('update-available', info => { clearUpdateRetry(); publishUpdateState('available', { version: info.version }); });
autoUpdater.on('update-not-available', info => { clearUpdateRetry(); publishUpdateState('notAvailable', { version: info.version }); });
autoUpdater.on('download-progress', info => publishUpdateState('downloading', { percent: info.percent, transferred: info.transferred, total: info.total }));
autoUpdater.on('update-downloaded', info => { clearUpdateRetry(); publishUpdateState('downloaded', { version: info.version }); });
autoUpdater.on('error', error => { console.error('[papo] Erro no atualizador:', error); publishUpdateState('error'); scheduleUpdateRetry(); });
ipcMain.handle('papo:app-version', event => trustedAppFrame(event) ? app.getVersion() : null);
ipcMain.handle('papo:update-state', event => trustedAppFrame(event) ? updateState : { state: 'unsupported' });
ipcMain.handle('papo:update-check', event => { if (!trustedAppFrame(event)) return false; void checkForUpdate(); return true });
ipcMain.handle('papo:update-install', event => { if (!trustedAppFrame(event) || updateState.state !== 'downloaded') return false; autoUpdater.quitAndInstall(); return true });
try { if (base) app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', new URL(base).origin); } catch (error) { console.error('[papo] O endereço salvo para permissões é inválido:', error); }
const setup = () => win.loadFile(path.join(__dirname, 'setup.html')).catch(error => console.error('[papo] Não consegui abrir a tela de configuração:', error));
const open = () => base ? win.loadURL(base + '/app?desktop=1').catch(error => { console.error('[papo] Não consegui abrir o servidor configurado:', error); if (win && !win.isDestroyed()) return setup(); }) : setup();
function create() {
  win = new BrowserWindow({ width: 1280, height: 800, minWidth: 900, minHeight: 600, backgroundColor: '#1e1f22',
    icon: path.join(__dirname, 'build/icon.png'), webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { const target = new URL(url); if (target.protocol === 'https:') void shell.openExternal(target.href); }
    catch (error) { console.warn('[papo] Link externo inválido:', error.message); }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (trustedOrigin(url) || setupUrl(url)) return;
    event.preventDefault();
  });
  win.webContents.on('did-fail-load', (e, code, d, url, main) => { if (main && !url.startsWith('file:')) setup(); });
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.control && i.shift && i.key.toLowerCase() === 's') setup(); });
  open();
}
const screenSelection = createScreenShareSelection({ desktopCapturer, platform: process.platform, logger: (phase, error) => console.error(`[papo] Falha no seletor de tela (${phase}):`, error) });
const pickerSessions = new Map();
let captureInProgress = false;
function pickerUrl(value) {
  try { return fileURLToPath(value) === path.resolve(__dirname, 'picker.html'); }
  catch { return false; }
}
function pickerSession(event) {
  const item = pickerSessions.get(event.sender.id);
  return item && event.sender === item.window.webContents && pickerUrl(event.senderFrame?.url) && !item.window.isDestroyed() ? item : null;
}
ipcMain.handle('picker:list', async event => {
  const item = pickerSession(event);
  if (!item) return { ok: false, sources: [], error: 'Seletor indisponível. Feche e tente novamente.' };
  return { ...(await item.selection.list()), platform: process.platform };
});
ipcMain.handle('picker:choose', async (event, id) => {
  const item = pickerSession(event);
  if (!item || (id !== null && (typeof id !== 'string' || id.length > 256))) return { ok: false, error: 'Seleção inválida. Atualize a lista.' };
  return item.selection.choose(id);
});
ipcMain.on('papo-save', (e, url) => {
  if (!setupFrame(e) || typeof url !== 'string' || url.length > 2048) return;
  let parsed;
  try { parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return; }
  catch { return; }
  base = parsed.origin;
  try { fs.writeFileSync(store(), JSON.stringify({ serverUrl: base }), { mode: 0o600 }); }
  catch (error) { console.error('[papo] Não consegui salvar o endereço do servidor:', error); return; }
  if (base.startsWith('http:')) { app.relaunch(); app.exit(); } else open();
});
app.whenReady().then(() => {
  const ses = session.defaultSession;
  const allowed = new Set(['media', 'display-capture', 'fullscreen', 'notifications']);
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => webContents === win?.webContents && trustedOrigin(requestingOrigin) && allowed.has(permission));
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents.getURL();
    callback(webContents === win?.webContents && trustedOrigin(requestingUrl) && allowed.has(permission));
  });
  ses.setDisplayMediaRequestHandler((request, callback) => {
    let replied = false, item = null, ownsCapture = false;
    const reply = streams => {
      if (replied) return;
      replied = true;
      if (ownsCapture) captureInProgress = false;
      if (item) pickerSessions.delete(item.window.webContents.id);
      try { callback(streams); }
      catch (error) { console.error('[papo] O Chromium recusou a resposta da captura:', error); }
      if (item?.window && !item.window.isDestroyed()) item.window.close();
    };
    try {
      if (!request.videoRequested || !trustedOrigin(request.securityOrigin) || !win || win.isDestroyed()) {
        reply(null);
        return;
      }
      if (captureInProgress) { reply(null); return; }
      captureInProgress = true;
      ownsCapture = true;
      const selection = screenSelection.open({ audioRequested: request.audioRequested }, reply);
      const picker = new BrowserWindow({ parent: win, modal: true, width: 980, height: 700, minWidth: 620, minHeight: 460, title: 'Compartilhar tela', autoHideMenuBar: true, backgroundColor: '#151225',
        webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
      item = { window: picker, selection };
      pickerSessions.set(picker.webContents.id, item);
      picker.setMenuBarVisibility(false);
      picker.webContents.on('will-navigate', (event, url) => { if (!pickerUrl(url)) event.preventDefault(); });
      picker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      picker.on('closed', () => selection.cancel());
      picker.webContents.on('destroyed', () => selection.cancel());
      picker.loadFile(path.join(__dirname, 'picker.html')).catch(error => {
        console.error('[papo] Não consegui abrir o seletor de compartilhamento:', error);
        selection.cancel();
      });
    } catch (error) {
      console.error('[papo] Não consegui iniciar a solicitação de compartilhamento:', error);
      reply(null);
    }
  });
  create();
  if (app.isPackaged) { setTimeout(checkForUpdate, 15000).unref?.(); setInterval(checkForUpdate, 12 * 60 * 60 * 1000).unref(); }
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { for (const item of pickerSessions.values()) item.selection.cancel(); pickerSessions.clear(); clearUpdateRetry(); });
