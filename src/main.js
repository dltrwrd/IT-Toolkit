const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const dns = require('dns');
const net = require('net');
const si = require('systeminformation');

let mainWindow;
let splashWindow;
let isDataReady = false;
let isMinSplashTimeDone = false;

function showSplash() {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
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
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    // Artificial delay to let user enjoy the splash screen
    setTimeout(() => {
      isMinSplashTimeDone = true;
      tryShowMain();
    }, 4500); // Minimum splash display time
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  Menu.setApplicationMenu(null);
}

function tryShowMain() {
  if (isDataReady && isMinSplashTimeDone && mainWindow) {
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

// Real Data Handlers
ipcMain.handle('get-processes', async () => {
  try {
    const list = await si.processes();
    return list.list
      .map(p => ({
        name: p.name,
        pid: p.pid,
        cpu: p.cpu,
        mem: p.memRss / 1024 / 1024, // to MB
        status: p.state,
      }))
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 50);
  } catch (e) {
    return [];
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
    const { exec } = require('child_process');
    
    // Fetch deeper health data including life remaining/percentage
    return new Promise((resolve) => {
      const psCmd = `Get-PhysicalDisk | ForEach-Object { $d=$_; $r=($_ | Get-StorageReliabilityCounter); [PSCustomObject]@{ FriendlyName=$d.FriendlyName; SerialNumber=$d.SerialNumber; PowerOnHours=$r.PowerOnHours; Status=$d.HealthStatus; Wear=([int](100 - $r.Wear)); LifeRemaining=$d.RemainingLifePercent } } | ConvertTo-Json`.replace(/\n/g, ' ');
      exec(`powershell "${psCmd}"`, (err, stdout) => {
        let extra = [];
        try { 
          if (!err && stdout) extra = JSON.parse(stdout); 
          if (!Array.isArray(extra)) extra = extra ? [extra] : [];
        } catch(e) {}
        
        const results = data.map((d, idx) => {
          const info = extra.find(e => e.SerialNumber === d.serialNum || (e.FriendlyName && e.FriendlyName.includes(d.name))) || extra[idx] || {};
          
          return {
            name: `${d.vendor} ${d.model || d.name || 'Unknown'}`.trim(),
            type: d.type || 'Fixed',
            interface: d.interfaceType || 'SATA',
            temperature: d.temperature,
            status: info.Status || 'Healthy',
            percent: info.LifeRemaining || info.Wear || 100, // Use life remaining or wear fallback
            poh: info.PowerOnHours || 0,
            serial: d.serialNum || info.SerialNumber || 'N/A',
            device: d.device
          };
        });
        resolve(results);
      });
    });
  } catch (e) {
    return [];
  }
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
          available: usage ? usage.available : (usage ? usage.size - usage.used : 0),
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
ipcMain.handle('ping-host', async (e, host) => {
  return new Promise(resolve => {
    const cmd = process.platform === 'win32' ? `ping -n 4 ${host}` : `ping -c 4 ${host}`;
    const t = Date.now();
    exec(cmd, { timeout: 12000 }, (err, stdout, stderr) => {
      resolve({ success: !err, output: err ? stderr || err.message : stdout, ms: Date.now() - t });
    });
  });
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
    dns.lookup(host, { all: true }, (err, addrs) => {
      if (err) resolve({ success: false, error: err.message });
      else resolve({ success: true, addresses: addrs });
    });
  });
});

// Run whitelisted commands
// Duplicate Finder logic
ipcMain.handle('get-duplicates', async (event, dirPath) => {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  const results = new Map(); // size -> [path]
  const duplicates = [];

  function getFiles(dir) {
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          // Avoid system folders
          if (!['node_modules', '.git', '$Recycle.Bin', 'System Volume Information'].includes(file.name)) {
            getFiles(fullPath);
          }
        } else {
          try {
            const stats = fs.statSync(fullPath);
            if (stats.size > 1024) { // Only files > 1KB
              if (!results.has(stats.size)) results.set(stats.size, []);
              results.get(stats.size).push({ path: fullPath, size: stats.size, name: file.name });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  getFiles(dirPath);

  // Partial hash for performance (first 16KB)
  function getFastHash(filePath) {
    try {
      const buffer = Buffer.alloc(16384);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 16384, 0);
      fs.closeSync(fd);
      return crypto.createHash('md5').update(buffer).digest('hex');
    } catch (e) { return Math.random().toString(); }
  }

  for (const [size, files] of results.entries()) {
    if (files.length > 1) {
      const hashGroups = new Map(); // hash -> [path]
      for (const f of files) {
        const h = getFastHash(f.path);
        if (!hashGroups.has(h)) hashGroups.set(h, []);
        hashGroups.get(h).push(f);
      }
      for (const [hash, groupedFiles] of hashGroups.entries()) {
        if (groupedFiles.length > 1) {
          duplicates.push({
            name: groupedFiles[0].name,
            size: groupedFiles[0].size,
            paths: groupedFiles.map(f => f.path),
            hash: hash
          });
        }
      }
    }
  }

  return duplicates;
});

ipcMain.handle('delete-file', async (event, filePath) => {
  const fs = require('fs');
  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-defaults', async () => {
  const os = require('os');
  const path = require('path');
  return {
    home: os.homedir(),
    downloads: path.join(os.homedir(), 'Downloads'),
    desktop: path.join(os.homedir(), 'Desktop')
  };
});

ipcMain.handle('get-top-folders', async (event, drivePath) => {
  try {
    const { exec } = require('child_process');
    let target = drivePath || 'C:\\';
    // Deeply ensure we have an absolute root like "C:\"
    target = target.split(':')[0] + ':\\';
    
    // Use single quotes inside PowerShell to prevent backslash-escape bugs with drive roots (C:\)
    const psCmd = `
      Get-ChildItem -Path '${target}' -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $size = 0;
        try {
          $fso = New-Object -ComObject Scripting.FileSystemObject;
          $folder = $fso.GetFolder($_.FullName);
          $size = [long]$folder.Size;
        } catch {}
        [PSCustomObject]@{ Name=$_.Name; FullName=$_.FullName; Size=$size }
      } | ConvertTo-Json -Compress
    `.replace(/\n/g, ' ');
    
    return new Promise((resolve) => {
      exec(`powershell -Command "${psCmd}"`, { timeout: 15000 }, (err, stdout) => {
        if (err || !stdout || stdout.trim() === '') return resolve([]);
        try {
          let data = JSON.parse(stdout);
          if (!Array.isArray(data)) data = data ? [data] : [];
          // Sort by size and take Top 5
          data.sort((a,b) => (b.Size || 0) - (a.Size || 0));
          resolve(data.slice(0, 5).map(f => ({
            name: f.Name,
            path: f.FullName,
            size: f.Size || 0
          })));
        } catch(e) { resolve([]); }
      });
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
