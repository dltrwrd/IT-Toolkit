const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cxi', {
  // Window controls
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close: () => ipcRenderer.send('win-close'),
  openUrl: url => ipcRenderer.send('open-url', url),

  // System
  getSysInfo: () => ipcRenderer.invoke('get-sysinfo'),
  getMetrics: () => ipcRenderer.invoke('get-metrics'),

  // Tools
  pingHost: host => ipcRenderer.invoke('ping-host', host),
  scanPort: (host, port) => ipcRenderer.invoke('scan-port', { host, port }),
  dnsLookup: host => ipcRenderer.invoke('dns-lookup', host),
  getProcesses: () => ipcRenderer.invoke('get-processes'),
  getDisks: () => ipcRenderer.invoke('get-disks'),
  getDiskHealth: () => ipcRenderer.invoke('get-disk-health'),
  getPartitions: () => ipcRenderer.invoke('get-partitions'),
  getTopFolders: path => ipcRenderer.invoke('get-top-folders', path),
  securityScan: () => ipcRenderer.invoke('security-scan'),
  getDuplicates: path => ipcRenderer.invoke('get-duplicates', path),
  stopScan: () => ipcRenderer.send('stop-duplicates'),
  getUserProfiles: () => ipcRenderer.invoke('get-user-profiles'),
  deleteUserProfile: sid => ipcRenderer.invoke('delete-user-profile', sid),
  deleteFile: path => ipcRenderer.invoke('delete-file', path),
  getDefaults: () => ipcRenderer.invoke('get-defaults'),
  runCmd: cmd => ipcRenderer.invoke('run-cmd', cmd),
  ready: () => ipcRenderer.send('app-ready'),
  onProfileProgress: (callback) => ipcRenderer.on('profile-load-progress', (event, data) => callback(data)),
});
