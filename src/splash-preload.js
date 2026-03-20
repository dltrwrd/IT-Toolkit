const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splash', {
  onProgress: (callback) => ipcRenderer.on('loading-progress', (event, data) => callback(data)),
});
