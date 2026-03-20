const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cxi', {
  // Window controls
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close:    () => ipcRenderer.send('win-close'),
  openUrl:  (url) => ipcRenderer.send('open-url', url),

  // System
  getSysInfo:  () => ipcRenderer.invoke('get-sysinfo'),
  getMetrics:  () => ipcRenderer.invoke('get-metrics'),

  // Tools
  pingHost:    (host) => ipcRenderer.invoke('ping-host', host),
  scanPort:    (host, port) => ipcRenderer.invoke('scan-port', { host, port }),
  dnsLookup:   (host) => ipcRenderer.invoke('dns-lookup', host),
  getProcesses: () => ipcRenderer.invoke('get-processes'),
  getDisks:     () => ipcRenderer.invoke('get-disks'),
  runCmd:      (cmd) => ipcRenderer.invoke('run-cmd', cmd),
});
