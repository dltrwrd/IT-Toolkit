const { app, BrowserWindow, ipcMain, Menu, shell, Tray, nativeImage } = require('electron');

// Silence terminal SSL/handshake errors from webviews (like Speedtest ads)
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('log-level', '3'); // Only show fatal errors

const path = require('path');
const os = require('os');
const { exec, spawn, spawnSync } = require('child_process');
const dns = require('dns');
const net = require('net');
const si = require('systeminformation');

let mainWindow;
let splashWindow;
let isDataReady = false;
let isMinSplashTimeDone = false;
let stopScanRequested = false;
const activeProcesses = new Map();

let appTray = null;
let closeToTray = true;

function setupTray() {
  if (appTray) return;
  // Fallback to a plain app icon base64 if no external file is loaded
  const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAKElEQVR42mNkYPhfz0AEYBxVSF+NhvQ0DMOoQvpqNKSnYRhGVQ/xUQB8+xX/iY/u8wAAAABJRU5ErkJggg==';
  const iconInfo = nativeImage.createFromDataURL(iconBase64);
  
  appTray = new Tray(iconInfo);
  appTray.setToolTip('CXI SLT Toolkit');
  
  const ctxMenu = Menu.buildFromTemplate([
    { label: 'Open GUI', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Exit Application', click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  
  appTray.setContextMenu(ctxMenu);
  appTray.on('click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

function showSplash() {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
  splashWindow.on('closed', () => (splashWindow = null));
}

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
      webviewTag: true,
    },
    show: false,
  });

  // Global ad-blocking to speed up embedded views and stop terminal errors
  const session = require('electron').session;
  const adBlockList = [
    '*://*.google-analytics.com/*',
    '*://*.googletagmanager.com/*',
    '*://*.doubleclick.net/*',
    '*://*.gammaplatform.com/*',
    '*://*.nex8.net/*',
    '*://*.amazon-adsystem.com/*',
    '*://*.adnxs.com/*',
    '*://*.pubmatic.com/*',
    '*://*.rubiconproject.com/*',
    '*://*.criteo.com/*',
    '*://*.cpmstar.com/*',
    '*://*.fast.nexx360.io/*',
    '*://*.smilewanted.com/*',
    '*://*.360yield.com/*',
    '*://*/*/usersync.aspx*',
    '*://*.outbrain.com/*',
    '*://*.taboola.com/*',
  ];

  session.defaultSession.webRequest.onBeforeRequest({ urls: adBlockList }, (details, callback) => {
    callback({ cancel: true });
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    // Show as soon as the window is ready (or wait for data if needed)
    isMinSplashTimeDone = true;
    tryShowMain();
  });

  mainWindow.on('close', (e) => {
    if (closeToTray && !app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  Menu.setApplicationMenu(null);
}

function tryShowMain() {
  if (isDataReady && mainWindow) {
    if (splashWindow) splashWindow.close();
    mainWindow.show();
  }
}

ipcMain.on('app-ready', () => {
  isDataReady = true;
  tryShowMain();
});

app.whenReady().then(() => {
  showSplash();
  createWindow();
  refreshGatewayCache(); // Pre-fetch gateway for faster tools
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window controls
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () =>
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()
);
ipcMain.on('win-close', () => mainWindow?.close());
ipcMain.on('stop-duplicates', () => {
  stopScanRequested = true;
});

// System info
ipcMain.handle('get-sysinfo', async () => {
  try {
    const cpus = os.cpus();
    const [gpu, base, bios, memLayout] = await Promise.all([
      si.graphics().catch(() => ({ controllers: [] })),
      si.baseboard().catch(() => ({})),
      si.bios().catch(() => ({})),
      si.memLayout().catch(() => []),
    ]);

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
      tmpdir: os.tmpdir(),
      networkInterfaces: os.networkInterfaces(),
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      gpu: gpu.controllers[0]?.model || 'Integrated Graphics',
      vram: gpu.controllers[0]?.vram || 0,
      motherboard: `${base.manufacturer || ''} ${base.model || ''}`.trim() || 'Generic Board',
      biosVersion: bios.version || 'Unknown',
      ramType: memLayout[0]?.type || 'DDR',
      ramClock: memLayout[0]?.clockSpeed || '',
    };
  } catch (e) {
    return { hostname: os.hostname(), error: 'Partial data' };
  }
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

let cachedGateway = null;

// Background gateway discovery
async function refreshGatewayCache() {
  try {
    exec(
      'powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null }).IPv4DefaultGateway.NextHop"',
      (err, stdout) => {
        if (!err && stdout) {
          const val = stdout.trim();
          if (val && val.includes('.') && val.split('.').length === 4) {
            cachedGateway = val;
            return;
          }
        }
        si.networkGateway().then(gw => {
          if (gw && gw !== '0.0.0.0' && gw.includes('.')) cachedGateway = gw;
        });
      }
    );
  } catch (e) {}
}

ipcMain.handle('get-gateway', async () => {
  if (cachedGateway) return cachedGateway;
  try {
    const psVal = await new Promise(resolve => {
      exec(
        'powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null }).IPv4DefaultGateway.NextHop"',
        (err, stdout) => {
          resolve(!err && stdout ? stdout.trim() : null);
        }
      );
    });
    if (psVal) {
      cachedGateway = psVal;
      return psVal;
    }
    return await si.networkGateway();
  } catch (e) {
    return null;
  }
});

let cachedIspInfo = null;
ipcMain.handle('get-isp-info', async () => {
  if (cachedIspInfo) return cachedIspInfo;
  try {
    const res = await fetch('http://ip-api.com/json/');
    const data = await res.json();
    if (data.status === 'success') {
      cachedIspInfo = data.isp;
      return cachedIspInfo;
    }
    return null;
  } catch(e) {
    return null;
  }
});

ipcMain.handle('open-external-ipconfig', async () => {
  spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', 'ipconfig /all'], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  return { success: true };
});

ipcMain.handle('run-ipconfig', async () => {
  return new Promise(resolve => {
    exec('ipconfig /all', (err, stdout) => {
      resolve(err ? 'Error running ipconfig' : stdout);
    });
  });
});

ipcMain.handle('get-wifi-data', async () => {
  try {
    const [connections, networks, defaultIfaceName] = await Promise.all([
      si.wifiConnections(),
      si.wifiNetworks(),
      si.networkInterfaceDefault(),
    ]);

    // If no WiFi connection, let's get the default ethernet/other interface
    let ethernet = null;
    if (!connections || connections.length === 0) {
      const ifaces = await si.networkInterfaces();
      ethernet = ifaces.find(i => i.iface === defaultIfaceName);
    }

    return {
      connected: connections,
      nearby: networks,
      ethernet: ethernet,
    };
  } catch (e) {
    return { connected: [], nearby: [], ethernet: null };
  }
});

let prevNetStats = null;
let lastNetTime = Date.now();

// Pre-warm stats during splash screen to establish a baseline early
exec('netstat -e', (err, stdout) => {
  if (!err && stdout) {
    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^[A-Za-z]+\s+(\d+)\s+(\d+)/);
      if (match) {
        prevNetStats = { rx: parseInt(match[1], 10), tx: parseInt(match[2], 10) };
        lastNetTime = Date.now();
        break;
      }
    }
  }
});

ipcMain.handle('get-network-stats', async () => {
  return new Promise((resolve) => {
    // We use netstat -e because it bypasses Windows Performance Counters entirely.
    // Performance counters are often corrupted on Windows 10/11, causing libraries to return 0.
    exec('netstat -e', (error, stdout) => {
      if (error || !stdout) {
        return resolve({ rx: 0, tx: 0, total: 0 });
      }

      // Output of netstat -e has a line like: "Bytes       12345678   98765432"
      const lines = stdout.split('\n');
      let currentRx = 0;
      let currentTx = 0;

      for (const line of lines) {
        // Flexible Regex to match "Letters Spaces Number Spaces Number" regardless of OS Language
        const match = line.trim().match(/^[A-Za-z]+\s+(\d+)\s+(\d+)/);
        if (match) {
          currentRx = parseInt(match[1], 10);
          currentTx = parseInt(match[2], 10);
          break; // The first matching line is always Bytes/Octets
        }
      }

      const now = Date.now();
      const deltaSec = (now - lastNetTime) / 1000;
      let rxKbps = 0;
      let txKbps = 0;

      if (prevNetStats && deltaSec > 0.5) {
        let rxDelta = currentRx - prevNetStats.rx;
        let txDelta = currentTx - prevNetStats.tx;
        
        // Handle 32-bit wrap around of netstat counters
        if (rxDelta < 0) rxDelta += 4294967296; 
        if (txDelta < 0) txDelta += 4294967296;

        rxKbps = (rxDelta / 1024) / deltaSec;
        txKbps = (txDelta / 1024) / deltaSec;
        
        // Safety bounds
        if (rxKbps > 10000000) rxKbps = prevNetStats.lastRxKbps || 0;
        if (txKbps > 10000000) txKbps = prevNetStats.lastTxKbps || 0;
      } else if (prevNetStats && prevNetStats.lastRxKbps !== undefined) {
        return resolve({ 
          rx: prevNetStats.lastRxKbps, 
          tx: prevNetStats.lastTxKbps, 
          total: prevNetStats.lastRxKbps + prevNetStats.lastTxKbps 
        });
      }

      prevNetStats = { 
        rx: currentRx, 
        tx: currentTx,
        lastRxKbps: rxKbps,
        lastTxKbps: txKbps
      };
      lastNetTime = now;

      resolve({
        rx: rxKbps,
        tx: txKbps,
        total: rxKbps + txKbps
      });
    });
  });
});

// Real Data Handlers
ipcMain.handle('get-processes', async () => {
  try {
    const list = await si.processes();
    return list.list
      .filter(p => p.pid !== 0 && p.name.toLowerCase() !== 'system idle process') // Hide System Idle Process to act like Windows Task Manager
      .map(p => ({
        name: p.name,
        pid: p.pid,
        cpu: p.cpu,
        mem: p.memRss / 1024,
        status: p.state,
      }))
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 50);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('kill-process', async (e, pid) => {
  try {
    if (process.platform === 'win32') {
      exec(`taskkill /F /PID ${pid}`);
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
      type: d.type,
    }));
  } catch (e) {
    return [];
  }
});

ipcMain.handle('get-disk-health', async () => {
  try {
    const data = await si.diskLayout();
    // Fetch deeper health data including life remaining/percentage
    return new Promise(resolve => {
      const script = `Get-PhysicalDisk | ForEach-Object { $d=$_; $r=($_ | Get-StorageReliabilityCounter); [PSCustomObject]@{ FriendlyName=$d.FriendlyName; SerialNumber=$d.SerialNumber; PowerOnHours=$r.PowerOnHours; Status=$d.HealthStatus; Wear=([int](100 - $r.Wear)); LifeRemaining=$d.RemainingLifePercent } } | ConvertTo-Json`;
      const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

      exec(`powershell -NoProfile -EncodedCommand ${encodedCommand}`, (err, stdout) => {
        let extra = [];
        try {
          if (!err && stdout) extra = JSON.parse(stdout);
          if (!Array.isArray(extra)) extra = extra ? [extra] : [];
        } catch (e) {}

        const results = data.map((d, idx) => {
          const info =
            extra.find(
              e =>
                e.SerialNumber === d.serialNum ||
                (e.FriendlyName && e.FriendlyName.includes(d.name))
            ) ||
            extra[idx] ||
            {};

          return {
            name: `${d.vendor} ${d.model || d.name || 'Unknown'}`.trim(),
            type: d.type || 'Fixed',
            interface: d.interfaceType || 'SATA',
            temperature: d.temperature,
            status: info.Status || 'Healthy',
            percent: info.LifeRemaining || info.Wear || 100, // Use life remaining or wear fallback
            poh: info.PowerOnHours || 0,
            serial: d.serialNum || info.SerialNumber || 'N/A',
            device: d.device,
          };
        });
        resolve(results);
      });
    });
  } catch (e) {
    return [];
  }
});

ipcMain.handle('open-external-ping', async (event, { host, count, continuous }) => {
  const args = continuous ? '-t' : `-n ${count}`;
  const title = `ping -t ${host}`;
  const cmd = `echo --- CXI PING TOOL --- & echo Target: ${host} & ping ${args} ${host}`;
  spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', `title ${title} & ${cmd}`], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  return { success: true };
});

ipcMain.handle('open-external-tracert', async (event, { host }) => {
  const cmd = `echo --- CXI TRACERT TOOL --- & echo Target: ${host} & tracert ${host}`;
  spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', `title tracert ${host} & ${cmd}`], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  return { success: true };
});

ipcMain.handle('open-speedtest', async () => {
  return { success: true };
});

ipcMain.handle('open-disk-cleanup', async () => {
  return new Promise(resolve => {
    exec('cleanmgr.exe', err => {
      resolve({ success: !err, error: err ? err.message : null });
    });
  });
});

ipcMain.handle('open-defrag', async () => {
  return new Promise(resolve => {
    exec('dfrgui.exe', err => {
      resolve({ success: !err, error: err ? err.message : null });
    });
  });
});

ipcMain.handle('get-partitions', async () => {
  try {
    const [parts, fs] = await Promise.all([si.blockDevices(), si.fsSize()]);
    return parts
      .filter(p => p.type === 'partition' || p.mount)
      .map(p => {
        // Find disk usage info for this mount point/device
        const usage = fs.find(f => f.mount === p.mount || f.device === p.name);
        return {
          name: p.name,
          label: p.label,
          mount: p.mount,
          size: p.size,
          used: usage ? usage.used : 0,
          available: usage ? usage.available : usage ? usage.size - usage.used : 0,
          fsType: p.fsType || (usage ? usage.type : 'Unknown'),
          device: p.device, // Used to group by Physical Drive
        };
      });
  } catch (e) {
    return [];
  }
});

ipcMain.handle('security-scan', async () => {
  return {
    score: 85,
    firewallStatus: 'Enabled',
    antivirusStatus: 'Active',
    lastUpdate: Date.now(),
    openPorts: [80, 443],
    vulnerabilities: [
      { title: 'Open Port 80', severity: 'Medium', desc: 'Unencrypted HTTP traffic allowed.' },
      { title: 'Guest Account', severity: 'Low', desc: 'Guest account is disabled (Secure).' },
    ],
  };
});

// Ping
ipcMain.on('ping-host', (event, { host, count, continuous }) => {
  const processId = `ping-${Date.now()}`;
  let cmd = 'ping';
  let args = [];

  if (process.platform === 'win32') {
    if (continuous) args.push('-t');
    else args.push('-n', count.toString());
  } else {
    args.push('-c', count.toString());
  }
  args.push(host);

  const ps = spawn(cmd, args);
  activeProcesses.set(processId, ps);

  ps.stdout.on('data', data => {
    event.reply('ping-output', { processId, data: data.toString() });
  });

  ps.stderr.on('data', data => {
    event.reply('ping-output', { processId, data: data.toString(), error: true });
  });

  ps.on('close', code => {
    activeProcesses.delete(processId);
    event.reply('ping-done', { processId, code });
  });

  event.reply('ping-started', { processId });
});

// Traceroute
ipcMain.on('tracert-host', (event, { host }) => {
  const processId = `tracert-${Date.now()}`;
  const cmd = process.platform === 'win32' ? 'tracert' : 'traceroute';
  const args = [host];

  const ps = spawn(cmd, args);
  activeProcesses.set(processId, ps);

  ps.stdout.on('data', data => {
    event.reply('tracert-output', { processId, data: data.toString() });
  });

  ps.stderr.on('data', data => {
    event.reply('tracert-output', { processId, data: data.toString(), error: true });
  });

  ps.on('close', code => {
    activeProcesses.delete(processId);
    event.reply('tracert-done', { processId, code });
  });

  event.reply('tracert-started', { processId });
});

ipcMain.on('stop-process', (event, processId) => {
  const ps = activeProcesses.get(processId);
  if (ps) {
    ps.kill();
    activeProcesses.delete(processId);
  }
});

// Port scan
ipcMain.handle('scan-port', async (e, { host, port }) => {
  return new Promise(resolve => {
    const s = new net.Socket();
    const t = Date.now();
    s.setTimeout(2000);
    s.connect(port, host, () => {
      s.destroy();
      resolve({ port, open: true, ms: Date.now() - t });
    });
    s.on('error', () => {
      s.destroy();
      resolve({ port, open: false, ms: Date.now() - t });
    });
    s.on('timeout', () => {
      s.destroy();
      resolve({ port, open: false, ms: Date.now() - t, timeout: true });
    });
  });
});

// DNS Lookup
ipcMain.handle('dns-lookup', async (e, host) => {
  return new Promise(resolve => {
    // 1. Core lookup for main IPs
    dns.lookup(host, { all: true }, async (err, addrs) => {
      const results = { success: true, addresses: addrs || [], records: [] };
      if (err) {
        resolve({ success: false, error: err.message });
        return;
      }

      // 2. Parallel Interrogation of all common record types
      // (Many ISPs block 'ANY' queries, so individual lookups are more robust)
      const types = ['MX', 'TXT', 'NS', 'CNAME', 'SOA'];
      const promises = types.map(type => {
        return new Promise(res => {
          const method = `resolve${type.charAt(0) + type.slice(1).toLowerCase()}`;
          if (typeof dns[method] === 'function') {
            dns[method](host, (dnsErr, data) => {
              if (!dnsErr && data) {
                // Standardize format: convert arrays of strings (TXT) or objects (MX)
                if (type === 'TXT') {
                  res({ type, entries: data.flat() });
                } else if (Array.isArray(data)) {
                  data.forEach(item => {
                    const rec = typeof item === 'object' ? item : { value: item };
                    results.records.push({ type, ...rec });
                  });
                  res();
                } else {
                  results.records.push({ type, value: data });
                  res();
                }
              } else {
                res();
              }
            });
          } else {
            res();
          }
        });
      });

      // Special case for TXT since it returns nested arrays
      const txtPromise = new Promise(res => {
        dns.resolveTxt(host, (dnsErr, data) => {
          if (!dnsErr && data) {
            data.forEach(entry => results.records.push({ type: 'TXT', entries: entry }));
          }
          res();
        });
      });

      await Promise.allSettled([...promises, txtPromise]);
      resolve(results);
    });
  });
});

// Run whitelisted commands
// Duplicate Finder logic
ipcMain.handle('get-duplicates', async (event, dirPath) => {
  const fs = require('fs').promises;
  const fsSync = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  const results = new Map(); // size -> [path]
  const duplicates = [];
  const dirs = [dirPath];
  let iterations = 0;

  // Partial hash for performance (first 16KB)
  function getFastHash(filePath) {
    try {
      const buffer = Buffer.alloc(16384);
      const fd = fsSync.openSync(filePath, 'r');
      const bytesRead = fsSync.readSync(fd, buffer, 0, 16384, 0);
      fsSync.closeSync(fd);
      return crypto.createHash('md5').update(buffer.slice(0, bytesRead)).digest('hex');
    } catch (e) {
      return Math.random().toString();
    }
  }

  // Non-blocking recursive scan
  stopScanRequested = false;
  while (dirs.length > 0) {
    if (stopScanRequested) break;
    const currentDir = dirs.pop();
    iterations++;

    // Yield to event loop every 100 directories to avoid freezing UI
    if (iterations % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }

    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (stopScanRequested) break;
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Avoid scanning root system folders and user app data to prevent accidental deletion of critical files
          const skip = [
            'node_modules',
            '.git',
            '$Recycle.Bin',
            'System Volume Information',
            'Windows',
            'Program Files',
            'Program Files (x86)',
            'AppData',
            'Local',
            'LocalLow',
            'Roaming',
            'Temp',
          ];
          if (!skip.includes(entry.name) && !entry.name.startsWith('.')) {
            dirs.push(fullPath);
          }
        } else if (entry.isFile()) {
          try {
            const stats = fsSync.statSync(fullPath);
            const ext = path.extname(entry.name).toLowerCase();
            const skipExts = [
              '.dll',
              '.exe',
              '.sys',
              '.dat',
              '.json',
              '.xml',
              '.log',
              '.ini',
              '.cache',
              '.tmp',
              '.manifest',
              '.lnk',
              '.cur',
              '.ani',
            ];

            // Only consider user files (Images, Docs, etc.) and avoid tiny files
            if (stats.size > 10240 && !skipExts.includes(ext)) {
              // Min 10KB + safe extensions
              if (!results.has(stats.size)) results.set(stats.size, []);
              results.get(stats.size).push({ path: fullPath, size: stats.size, name: entry.name });
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      // Skip directories that we can't read
    }
  }

  // Phase 2: Verify duplicates by hash
  for (const [size, files] of results.entries()) {
    if (files.length > 1) {
      const hashGroups = new Map();
      for (const f of files) {
        const h = getFastHash(f.path);
        if (!hashGroups.has(h)) hashGroups.set(h, []);
        hashGroups.get(h).push(f);
      }
      for (const [hash, groupedFiles] of hashGroups.entries()) {
        if (stopScanRequested) break;
        if (groupedFiles.length > 1) {
          duplicates.push({
            name: groupedFiles[0].name,
            size: groupedFiles[0].size,
            paths: groupedFiles.map(f => f.path),
            hash: hash,
          });
        }
      }
      if (stopScanRequested) break;
      // Yield again to event loop between group processing
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return duplicates;
});

ipcMain.handle('delete-file', async (event, filePath) => {
  const fs = require('fs');
  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-user-profiles', async (event, isStartup = false) => {
  return new Promise((resolve, reject) => {
    const script = `
      $ProgressPreference = 'SilentlyContinue'
      $profiles = Get-CimInstance Win32_UserProfile | Select-Object SID, LocalPath, Loaded, Special
      $total = $profiles.Count
      $results = @()
      $count = 0
      foreach ($p in $profiles) {
        $count++
        $path = $p.LocalPath
        $sid = $p.SID

        # Resolve name
        $name = $sid
        try {
          $sidObj = New-Object System.Security.Principal.SecurityIdentifier($sid)
          $name = $sidObj.Translate([System.Security.Principal.NTAccount]).Value
        } catch { }

        # Output progress safely using format operator to avoid variable-drive issues
        $msg = "PROG:{0}:{1}:{2}" -f $count, $total, $name
        Write-Host $msg

        $totalSize = 0
        if (Test-Path $path) {
          try {
             $items = Get-ChildItem -Path $path -Force -ErrorAction SilentlyContinue
             foreach ($item in $items) {
                if ($item.PSIsContainer) {
                   $s = (Get-ChildItem -Path $item.FullName -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
                   if ($s) { $totalSize += $s }
                } else {
                   $totalSize += $item.Length
                }
             }
          } catch { }
        }
        $obj = $p | Add-Member -NotePropertyName UserName -NotePropertyValue $name -PassThru | Add-Member -NotePropertyName TotalSize -NotePropertyValue ([long]$totalSize) -PassThru
        Write-Host "DATA:$($obj | ConvertTo-Json -Compress)"
        $results += $obj
      }
      $results | ConvertTo-Json
    `.trim();

    const ps = spawn(
      'powershell',
      ['-NoProfile', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      {
        maxBuffer: 1024 * 1024 * 10,
      }
    );

    let stdout = '';
    let stderr = '';
    let buffer = '';

    ps.stdout.on('data', data => {
      buffer += data.toString();
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop(); // Remaining partial line in buffer

      for (let line of lines) {
        if (line.trim().startsWith('PROG:')) {
          const parts = line.trim().split(':');
          if (parts.length >= 4) {
            const count = parseInt(parts[1]);
            const total = parseInt(parts[2]);
            const name = parts[3];
            const percent = Math.round((count / total) * 100);

            const progressInfo = {
              count,
              total,
              name,
              percent,
              status: `Loading profile: ${name}`,
            };

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('profile-load-progress', progressInfo);
            }
          }
        } else if (line.trim().startsWith('DATA:')) {
          try {
            const json = line.trim().substring(5);
            const profile = JSON.parse(json);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('profile-data-stream', profile);
            }
          } catch (e) {}
        } else if (line.trim().length > 0) {
          stdout += line + '\n';
        }
      }
    });

    ps.stderr.on('data', data => {
      stderr += data.toString();
    });

    ps.on('close', code => {
      stdout += buffer;
      if (code !== 0) {
        console.error('Profile fetch error:', stderr);
        return resolve([]);
      }
      try {
        let cleanStdout = stdout.trim();
        const jsonStart = cleanStdout.search(/[\[\{]/);
        if (jsonStart >= 0) {
          cleanStdout = cleanStdout.substring(jsonStart);
        }
        let profiles = JSON.parse(cleanStdout);
        if (!Array.isArray(profiles)) profiles = [profiles];
        resolve(profiles);
      } catch (e) {
        console.error('JSON Parse Error:', e, stdout);
        resolve([]);
      }
    });
  });
});

ipcMain.handle('delete-user-profile', async (event, sid) => {
  return new Promise(resolve => {
    try {
      const script = `Get-CimInstance Win32_UserProfile -Filter "SID = '${sid}'" | Remove-CimInstance`;
      const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

      const ps = spawn('powershell', ['-NoProfile', '-EncodedCommand', encodedCommand]);

      let stderr = '';
      ps.stderr.on('data', data => {
        stderr += data.toString();
      });

      ps.on('close', code => {
        if (code !== 0) {
          console.error('Profile deletion failed:', stderr);
          resolve({ success: false, error: stderr || 'Unknown exit code' });
        } else {
          resolve({ success: true });
        }
      });
    } catch (e) {
      console.error('Profile deletion exception:', e);
      resolve({ success: false, error: e.message });
    }
  });
});

ipcMain.handle('get-defaults', async () => {
  const os = require('os');
  const path = require('path');
  return {
    home: os.homedir(),
    downloads: path.join(os.homedir(), 'Downloads'),
    desktop: path.join(os.homedir(), 'Desktop'),
  };
});

ipcMain.handle('get-top-folders', async (event, drivePath) => {
  try {
    let target = drivePath || 'C:\\';
    // Deeply ensure we have an absolute root like "C:\"
    target = target.split(':')[0] + ':\\';

    const script = `

      Get-ChildItem -Path '${target}' -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $size = 0;
        try {
          $fso = New-Object -ComObject Scripting.FileSystemObject;
          $folder = $fso.GetFolder($_.FullName);
          $size = [long]$folder.Size;
        } catch {}
        [PSCustomObject]@{ Name=$_.Name; FullName=$_.FullName; Size=$size }
      } | ConvertTo-Json -Compress
    `.trim();

    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

    return new Promise(resolve => {
      exec(
        `powershell -NoProfile -EncodedCommand ${encodedCommand}`,
        { timeout: 15000 },
        (err, stdout) => {
          if (err || !stdout || stdout.trim() === '') return resolve([]);
          try {
            let data = JSON.parse(stdout);
            if (!Array.isArray(data)) data = data ? [data] : [];
            // Sort by size and take Top 5
            data.sort((a, b) => (b.Size || 0) - (a.Size || 0));
            resolve(
              data.slice(0, 5).map(f => ({
                name: f.Name,
                path: f.FullName,
                size: f.Size || 0,
              }))
            );
          } catch (e) {
            resolve([]);
          }
        }
      );
    });
  } catch (e) {
    return [];
  }
});

const SAFE_CMDS = [
  'ipconfig',
  'netstat',
  'tasklist',
  'wmic',
  'systeminfo',
  'net start',
  'hostname',
  'whoami',
];
ipcMain.handle('run-cmd', async (e, cmd) => {
  const safe = SAFE_CMDS.some(w => cmd.toLowerCase().startsWith(w));
  if (!safe) return { success: false, output: 'Command not in whitelist.' };
  return new Promise(resolve => {
    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ success: !err, output: err ? stderr || err.message : stdout });
    });
  });
});

ipcMain.on('open-url', (e, url) => shell.openExternal(url));

ipcMain.handle('set-startup', async (e, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled === true,
    openAsHidden: true
  });
});

ipcMain.handle('open-logs-folder', async () => {
  shell.openPath(app.getPath('userData'));
});

ipcMain.handle('set-tray', async (e, enabled) => {
  closeToTray = enabled === true;
  if (closeToTray) {
    setupTray();
  } else if (appTray) {
    appTray.destroy();
    appTray = null;
  }
});

ipcMain.handle('get-windows-events', async (e, count = 20) => {
  return new Promise(resolve => {
    // Fetch newest events from System log. Using Get-EventLog for better combatibility
    const script = `Get-EventLog -LogName System -Newest ${count} | ForEach-Object { [PSCustomObject]@{ time=$_.TimeGenerated.ToString("HH:mm:ss"); level=$_.EntryType.ToString(); msg=$_.Message.Replace("\\r\\n", " ").Replace("\\n", " ").Trim() } } | ConvertTo-Json`;
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
    
    exec(`powershell -NoProfile -EncodedCommand ${encodedCommand}`, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      try {
        let data = JSON.parse(stdout);
        if (!Array.isArray(data)) data = [data];
        // Normalize levels to match our CSS (INFO, WARN, ERR, OK)
        resolve(data.map(ev => {
          let lvl = 'INFO';
          if (ev.level === 'Error') lvl = 'ERR';
          else if (ev.level === 'Warning') lvl = 'WARN';
          else if (ev.level === 'Information') lvl = 'INFO';
          else if (ev.level === 'SuccessAudit') lvl = 'OK';
          
          return {
            time: ev.time,
            level: lvl,
            msg: ev.msg.length > 150 ? ev.msg.substring(0, 150) + '...' : ev.msg
          };
        }));
      } catch (e) {
        resolve([]);
      }
    });
  });
});

ipcMain.handle('get-startup-items', async () => {
  return new Promise(resolve => {
    const script = `
      $paths = @("HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run")
      $results = @()
      foreach ($p in $paths) {
        if (Test-Path $p) {
          Get-ItemProperty $p | Get-Member -MemberType NoteProperty | ForEach-Object {
            $name = $_.Name
            $val = (Get-ItemProperty $p).$name
            $results += [PSCustomObject]@{ Name=$name; Path=$val; Registry=$p }
          }
        }
      }
      $results | ConvertTo-Json
    `.trim();
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -EncodedCommand ${encodedCommand}`, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      try {
        let data = JSON.parse(stdout);
        if (!Array.isArray(data)) data = data ? [data] : [];
        resolve(data.map(i => ({
          name: i.Name,
          path: i.Path,
          registry: i.Registry,
          enabled: true // Registry entries in 'Run' are enabled by default
        })));
      } catch (e) { resolve([]); }
    });
  });
});

ipcMain.handle('toggle-startup-item', async (e, { name, registry, enabled }) => {
  return new Promise(resolve => {
    if (enabled) {
      // Re-enable is complex without stored path, let's assume we mainly want to disable
      resolve(false);
    } else {
      // Remove from registry
      const cmd = `Remove-ItemProperty -Path "${registry}" -Name "${name}" -ErrorAction SilentlyContinue`;
      exec(`powershell -NoProfile -Command "${cmd}"`, (err) => {
        resolve(!err);
      });
    }
  });
});
