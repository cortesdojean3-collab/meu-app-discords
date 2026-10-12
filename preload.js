const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('papo', {
  save: u => ipcRenderer.send('papo-save', u),
  appVersion: () => ipcRenderer.invoke('papo:app-version'),
  updates: {
    check: () => ipcRenderer.invoke('papo:update-check'),
    install: () => ipcRenderer.invoke('papo:update-install'),
    onState: callback => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_, state) => callback(state);
      ipcRenderer.on('papo:update-state', listener);
      ipcRenderer.invoke('papo:update-state').then(state => callback(state)).catch(error => console.error('[papo] Não consegui consultar o estado do atualizador:', error));
      return () => ipcRenderer.removeListener('papo:update-state', listener);
    }
  }
});
