const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const dns = require('dns');
const net = require('net');
const si = require('systeminformation');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: '#f0f4f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  Menu.setApplicationMenu(null);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Window controls
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('win-close', () => mainWindow?.close());

// System info
ipcMain.handle('get-sysinfo', async () => {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: os.arch(),
    release: os.release(),
    type: os.type(),
    cpuModel: cpus[0]?.model || 'Unknown CPU',
    cpuCores: cpus.length,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    uptime: os.uptime(),
    username: os.userInfo().username,
    homedir: os.homedir(),
    networkInterfaces: os.networkInterfaces(),
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
  };
});

// Live metrics
ipcMain.handle('get-metrics', async () => {
  try {
    const [load, mem] = await Promise.all([si.currentLoad(), si.mem()]);
    return {
      cpu: Math.round(load.currentLoad),
      memUsed: mem.active,
      memTotal: mem.total,
      memPct: Math.round((mem.active / mem.total) * 100),
      uptime: os.uptime(),
    };
  } catch (e) {
    const memUsed = os.totalmem() - os.freemem();
    return {
      cpu: 5,
      memUsed: memUsed,
      memTotal: os.totalmem(),
      memPct: Math.round((memUsed / os.totalmem()) * 100),
      uptime: os.uptime(),
    };
  }
});

// Real Data Handlers
ipcMain.handle('get-processes', async () => {
  try {
    const list = await si.processes();
    return list.list.map(p => ({
      name: p.name,
      pid: p.pid,
      cpu: p.cpu,
      mem: p.memRss / 1024 / 1024, // to MB
      status: p.state
    })).sort((a, b) => b.cpu - a.cpu).slice(0, 50);
  } catch (e) { return []; }
});

ipcMain.handle('get-disks', async () => {
  try {
    const disks = await si.fsSize();
    return disks.map(d => ({
      drive: d.mount,
      label: d.fs,
      total: d.size,
      used: d.used,
      free: d.size - d.used,
      percent: d.use,
      type: d.type
    }));
  } catch (e) { return []; }
});

// Ping
ipcMain.handle('ping-host', async (e, host) => {
  return new Promise(resolve => {
    const cmd = process.platform === 'win32' ? `ping -n 4 ${host}` : `ping -c 4 ${host}`;
    const t = Date.now();
    exec(cmd, { timeout: 12000 }, (err, stdout, stderr) => {
      resolve({ success: !err, output: err ? (stderr || err.message) : stdout, ms: Date.now() - t });
    });
  });
});

// Port scan
ipcMain.handle('scan-port', async (e, { host, port }) => {
  return new Promise(resolve => {
    const s = new net.Socket();
    const t = Date.now();
    s.setTimeout(2000);
    s.connect(port, host, () => { s.destroy(); resolve({ port, open: true, ms: Date.now() - t }); });
    s.on('error', () => { s.destroy(); resolve({ port, open: false, ms: Date.now() - t }); });
    s.on('timeout', () => { s.destroy(); resolve({ port, open: false, ms: Date.now() - t, timeout: true }); });
  });
});

// DNS Lookup
ipcMain.handle('dns-lookup', async (e, host) => {
  return new Promise(resolve => {
    dns.lookup(host, { all: true }, (err, addrs) => {
      if (err) resolve({ success: false, error: err.message });
      else resolve({ success: true, addresses: addrs });
    });
  });
});

// Run whitelisted commands
const SAFE_CMDS = ['ipconfig', 'netstat', 'tasklist', 'wmic', 'systeminfo', 'net start', 'hostname', 'whoami'];
ipcMain.handle('run-cmd', async (e, cmd) => {
  const safe = SAFE_CMDS.some(w => cmd.toLowerCase().startsWith(w));
  if (!safe) return { success: false, output: 'Command not in whitelist.' };
  return new Promise(resolve => {
    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ success: !err, output: err ? (stderr || err.message) : stdout });
    });
  });
});

ipcMain.on('open-url', (e, url) => shell.openExternal(url));
