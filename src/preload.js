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
  getGateway: () => ipcRenderer.invoke('get-gateway'),

  // Tools
  pingHost: opts => ipcRenderer.send('ping-host', opts),
  onPingStarted: cb => ipcRenderer.on('ping-started', (e, data) => cb(data)),
  onPingOutput: cb => ipcRenderer.on('ping-output', (e, data) => cb(data)),
  onPingDone: cb => ipcRenderer.on('ping-done', (e, data) => cb(data)),

  tracertHost: opts => ipcRenderer.send('tracert-host', opts),
  onTracertStarted: cb => ipcRenderer.on('tracert-started', (e, data) => cb(data)),
  onTracertOutput: cb => ipcRenderer.on('tracert-output', (e, data) => cb(data)),
  onTracertDone: cb => ipcRenderer.on('tracert-done', (e, data) => cb(data)),
  openExternalPing: opts => ipcRenderer.invoke('open-external-ping', opts),
  openExternalTracert: opts => ipcRenderer.invoke('open-external-tracert', opts),
  openSpeedtest: () => ipcRenderer.invoke('open-speedtest'),

  stopProcess: id => ipcRenderer.send('stop-process', id),
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
  runIpconfig: () => ipcRenderer.invoke('run-ipconfig'),
  openExternalIpconfig: () => ipcRenderer.invoke('open-external-ipconfig'),
  getWifiData: () => ipcRenderer.invoke('get-wifi-data'),
  runCmd: cmd => ipcRenderer.invoke('run-cmd', cmd),
  ready: () => ipcRenderer.send('app-ready'),
  onProfileProgress: callback =>
    ipcRenderer.on('profile-load-progress', (event, data) => callback(data)),
  onProfileData: callback => ipcRenderer.on('profile-data-stream', (event, data) => callback(data)),
  openDiskCleanup: () => ipcRenderer.invoke('open-disk-cleanup'),
  openDefrag: () => ipcRenderer.invoke('open-defrag'),
});
