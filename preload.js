const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('papo', { save: u => ipcRenderer.send('papo-save', u) });
