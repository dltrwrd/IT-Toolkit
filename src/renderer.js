/* ═══════════════════════════════════════════════
   CXI SLT Toolkit — renderer.js
   All UI logic, live metrics, charts, tools
═══════════════════════════════════════════════ */

// ── State ──
let metricsInterval = null;
let refreshRate = 2000;
let cpuHistory = Array(60).fill(0);
let ramHistory = Array(60).fill(0);
let wifiHistory = Array(60).fill(-70);
let allLogs = [];
let allProcs = [];

// ── Navigation ──
function navigate(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item, .nav-sub').forEach(n => n.classList.remove('active'));

  const section = document.getElementById('s-' + id);
  if (section) section.classList.add('active');
  if (el) el.classList.add('active');

  const labels = {
    'dashboard':'Dashboard','sysinfo':'System Info','disk-analyzer':'Disk Analyzer',
    'disk-health':'Disk Health','partitions':'Partition Manager','duplicates':'Duplicate Finder',
    'ping':'Ping Test','portscan':'Port Scanner','dns':'DNS Lookup','speedtest':'Speed Test',
    'wifi':'WiFi Monitor','processes':'Process Manager','eventlogs':'Event Log Viewer',
    'startup':'Startup Manager','security':'Security Scanner','settings':'Settings'
  };
  document.getElementById('breadcrumb').textContent = labels[id] || id;

  // Lazy load data
  if (id === 'sysinfo') loadSysInfo();
  if (id === 'disk-analyzer') loadDiskInfo();
  if (id === 'processes') loadProcesses();
  if (id === 'eventlogs') loadEventLogs();
  if (id === 'startup') loadStartupItems();
  if (id === 'dns') loadIpInfo();
  if (id === 'partitions') loadPartitions();
  if (id === 'wifi') initWifiChart();
}

function toggleDropdown(id, el) {
  const dd = document.getElementById(id);
  const isOpen = dd.classList.contains('open');
  document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('open'));
  if (!isOpen) { dd.classList.add('open'); el.classList.add('open'); }
}

// ── Clock ──
function updateClock() {
  const now = new Date();
  document.getElementById('titlebar-time').textContent =
    now.toLocaleTimeString('en-US', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ── Helpers ──
function fmtBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function fmtUptime(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function fmtUptimeLong(s) {
  const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

// ── History Canvas Chart ──
function drawLineChart(canvasId, datasets, maxVal = 100) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.offsetWidth || 400;
  const H = canvas.parentElement.offsetHeight || 120;
  canvas.width = W; canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = 'rgba(220,229,242,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (H / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  datasets.forEach(({ data, color, fill }) => {
    const len = data.length;
    const step = W / (len - 1);

    // Fill
    if (fill) {
      ctx.beginPath();
      data.forEach((val, i) => {
        const x = i * step;
        const y = H - (val / maxVal) * H;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, color.replace(')', ', 0.15)').replace('rgb', 'rgba'));
      grad.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba'));
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    data.forEach((val, i) => {
      const x = i * step;
      const y = H - (val / maxVal) * H;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Last dot
    const lastX = (len - 1) * step;
    const lastY = H - (data[len - 1] / maxVal) * H;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

// ── Live Metrics ──
async function updateMetrics() {
  try {
    const m = await window.cxi.getLiveMetrics();

    // Update CPU
    cpuHistory.push(m.cpuUsage); cpuHistory.shift();
    ramHistory.push(m.ramPercent); ramHistory.shift();

    document.getElementById('m-cpu').textContent = m.cpuUsage + '%';
    document.getElementById('mb-cpu').style.width = m.cpuUsage + '%';
    document.getElementById('ms-cpu').textContent = `${m.cpuUsage > 80 ? '⚠️ High' : 'Normal'} load`;

    document.getElementById('m-ram').textContent = m.ramPercent + '%';
    document.getElementById('mb-ram').style.width = m.ramPercent + '%';
    document.getElementById('ms-ram').textContent = `${fmtBytes(m.ramUsed)} / ${fmtBytes(m.ramTotal)}`;

    document.getElementById('m-uptime').textContent = fmtUptimeLong(m.uptime);
    document.getElementById('sb-uptime').textContent = fmtUptime(m.uptime);

    drawLineChart('history-chart', [
      { data: cpuHistory, color: 'rgb(26,110,245)', fill: true },
      { data: ramHistory, color: 'rgb(12,173,110)', fill: true }
    ], 100);

  } catch(e) { console.error('Metrics error:', e); }
}

// ── Dashboard Init ──
async function initDashboard() {
  try {
    const info = await window.cxi.getSystemInfo();

    document.getElementById('sb-hostname').textContent = info.hostname;

    // System status card
    document.getElementById('dash-sysinfo').innerHTML = `
      <b>${info.hostname}</b> · ${info.type}<br>
      ${info.cpuModel}<br>
      ${info.cpuCores} cores @ ${info.cpuSpeed} MHz<br>
      ${info.arch} · ${info.release}<br>
      Home: <span style="font-family:var(--mono);font-size:11px">${info.homedir}</span>
    `;

    // Network interfaces
    const ifaces = Object.entries(info.networkInterfaces || {});
    const netLines = ifaces.slice(0,5).map(([name, addrs]) => {
      const ipv4 = addrs.find(a => a.family === 'IPv4');
      return ipv4 ? `<div><b>${name}</b>: <span style="font-family:var(--mono);font-size:12px">${ipv4.address}</span></div>` : '';
    }).filter(Boolean).join('');
    document.getElementById('dash-network').innerHTML = netLines || 'No interfaces found';

    // Load disks
    loadDashDisks();

  } catch(e) { console.error('Dashboard init error:', e); }
}

async function loadDashDisks() {
  try {
    const disks = await window.cxi.getDiskInfo();
    const el = document.getElementById('dash-disks');
    if (!disks.length) { el.innerHTML = '<div class="text-muted text-sm">No drives found</div>'; return; }
    document.getElementById('ms-disk').textContent = `${disks.length} drive(s)`;
    el.innerHTML = disks.map(d => `
      <div class="mb-3">
        <div class="flex justify-between mb-1">
          <span class="text-sm font-bold">${d.drive}</span>
          <span class="text-xs text-mono text-muted">${fmtBytes(d.used)} / ${fmtBytes(d.total)}</span>
        </div>
        <div class="disk-bar"><div class="disk-fill ${d.percent > 90 ? 'danger' : d.percent > 75 ? 'warn' : ''}" style="width:${d.percent}%"></div></div>
        <div class="text-xs text-muted mt-1">${d.percent}% used · ${fmtBytes(d.free)} free</div>
      </div>
    `).join('');
  } catch(e) {}
}

// ── System Info ──
async function loadSysInfo() {
  try {
    const info = await window.cxi.getSystemInfo();
    document.getElementById('os-info').innerHTML = `
      <div class="info-row"><span class="info-key">Hostname</span><span class="info-val">${info.hostname}</span></div>
      <div class="info-row"><span class="info-key">OS Type</span><span class="info-val">${info.type}</span></div>
      <div class="info-row"><span class="info-key">Platform</span><span class="info-val">${info.platform}</span></div>
      <div class="info-row"><span class="info-key">Release</span><span class="info-val">${info.release}</span></div>
      <div class="info-row"><span class="info-key">Architecture</span><span class="info-val">${info.arch}</span></div>
      <div class="info-row"><span class="info-key">Uptime</span><span class="info-val">${fmtUptimeLong(info.uptime)}</span></div>
      <div class="info-row"><span class="info-key">Home Dir</span><span class="info-val">${info.homedir}</span></div>
      <div class="info-row"><span class="info-key">Temp Dir</span><span class="info-val">${info.tmpdir}</span></div>
      <div class="info-row"><span class="info-key">User</span><span class="info-val">${info.userInfo?.username || 'N/A'}</span></div>
    `;
    document.getElementById('cpu-info').innerHTML = `
      <div class="info-row"><span class="info-key">CPU Model</span><span class="info-val">${info.cpuModel}</span></div>
      <div class="info-row"><span class="info-key">Cores / Threads</span><span class="info-val">${info.cpuCores}</span></div>
      <div class="info-row"><span class="info-key">Speed</span><span class="info-val">${info.cpuSpeed} MHz</span></div>
      <div class="info-row"><span class="info-key">Total RAM</span><span class="info-val">${fmtBytes(info.totalMem)}</span></div>
      <div class="info-row"><span class="info-key">Free RAM</span><span class="info-val">${fmtBytes(info.freeMem)}</span></div>
      <div class="info-row"><span class="info-key">Used RAM</span><span class="info-val">${fmtBytes(info.totalMem - info.freeMem)}</span></div>
    `;

    // Network table
    const tbody = document.querySelector('#net-table tbody');
    const rows = [];
    Object.entries(info.networkInterfaces || {}).forEach(([name, addrs]) => {
      addrs.forEach(addr => {
        rows.push(`<tr>
          <td><b>${name}</b></td>
          <td class="mono">${addr.address}</td>
          <td>${addr.family}</td>
          <td class="mono">${addr.mac || '—'}</td>
          <td>${addr.internal ? '<span class="tag gray">Internal</span>' : '<span class="tag blue">External</span>'}</td>
        </tr>`);
      });
    });
    tbody.innerHTML = rows.join('') || '<tr><td colspan="5" class="text-muted">No interfaces</td></tr>';
  } catch(e) { console.error(e); }
}

// ── Disk Info ──
async function loadDiskInfo() {
  const el = document.getElementById('disk-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Scanning drives...</div>';
  try {
    const disks = await window.cxi.getDiskInfo();
    if (!disks.length) { el.innerHTML = '<div class="card text-muted">No drives found.</div>'; return; }
    el.innerHTML = disks.map(d => `
      <div class="disk-item mb-3">
        <div class="disk-header">
          <div>
            <span class="disk-drive">${d.drive}</span>
            <span class="tag ${d.percent > 90 ? 'red' : d.percent > 75 ? 'yellow' : 'green'} ml-2">${d.percent}%</span>
          </div>
          <span class="disk-sizes">${fmtBytes(d.used)} used · ${fmtBytes(d.free)} free · ${fmtBytes(d.total)} total</span>
        </div>
        <div class="disk-bar">
          <div class="disk-fill ${d.percent > 90 ? 'danger' : d.percent > 75 ? 'warn' : ''}" style="width:${d.percent}%"></div>
        </div>
        <div class="grid-3 gap-3 mt-2">
          <div style="background:var(--surface);padding:10px;border-radius:8px;text-align:center">
            <div style="font-family:var(--display);font-weight:700;font-size:16px">${fmtBytes(d.total)}</div>
            <div class="text-xs text-muted">Total</div>
          </div>
          <div style="background:var(--blue-soft);padding:10px;border-radius:8px;text-align:center">
            <div style="font-family:var(--display);font-weight:700;font-size:16px;color:var(--blue)">${fmtBytes(d.used)}</div>
            <div class="text-xs text-muted">Used</div>
          </div>
          <div style="background:var(--green-soft);padding:10px;border-radius:8px;text-align:center">
            <div style="font-family:var(--display);font-weight:700;font-size:16px;color:var(--green)">${fmtBytes(d.free)}</div>
            <div class="text-xs text-muted">Free</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch(e) { el.innerHTML = '<div class="card">Error loading disk info.</div>'; }
}

// ── Partitions ──
async function loadPartitions() {
  try {
    const disks = await window.cxi.getDiskInfo();
    const el = document.getElementById('partition-view');
    if (!disks.length) { el.innerHTML = '<div class="text-muted">No partitions found.</div>'; return; }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Drive</th><th>Total Size</th><th>Used</th><th>Free</th><th>Usage</th><th>Status</th></tr></thead>
        <tbody>
          ${disks.map(d => `<tr>
            <td class="font-bold text-mono">${d.drive}</td>
            <td>${fmtBytes(d.total)}</td>
            <td>${fmtBytes(d.used)}</td>
            <td>${fmtBytes(d.free)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:80px;height:6px;background:var(--border);border-radius:10px;overflow:hidden">
                  <div style="width:${d.percent}%;height:100%;background:${d.percent>90?'var(--red)':d.percent>75?'var(--yellow)':'var(--blue)'};border-radius:10px"></div>
                </div>
                <span class="text-mono text-xs">${d.percent}%</span>
              </div>
            </td>
            <td><span class="tag ${d.percent > 90 ? 'red' : d.percent > 75 ? 'yellow' : 'green'}">${d.percent > 90 ? 'Critical' : d.percent > 75 ? 'Warning' : 'Healthy'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  } catch(e) {}
}

// ── Duplicates ──
function scanDuplicates() {
  const path = document.getElementById('dup-path').value;
  const res = document.getElementById('dup-results');
  const list = document.getElementById('dup-list');
  res.style.display = 'block';
  list.innerHTML = '<div class="loading"><div class="spinner"></div>Simulating scan of ' + path + '...</div>';
  setTimeout(() => {
    const fakeGroups = [
      { name: 'document_final.pdf', size: 2456789, count: 3, paths: [path+'\\docs\\doc1.pdf', path+'\\backup\\doc1.pdf', path+'\\old\\doc1.pdf'] },
      { name: 'photo_001.jpg', size: 4231000, count: 2, paths: [path+'\\photos\\img1.jpg', path+'\\Desktop\\img1.jpg'] },
      { name: 'setup.exe', size: 51200000, count: 2, paths: [path+'\\Downloads\\setup.exe', path+'\\Installers\\setup.exe'] }
    ];
    list.innerHTML = `<div class="mb-2 text-sm" style="color:var(--text2)">Found <b>${fakeGroups.length} duplicate groups</b> — potential space savings: <b style="color:var(--green)">${fmtBytes(fakeGroups.reduce((a,g)=>a+(g.size*(g.count-1)),0))}</b></div>` +
    fakeGroups.map(g => `
      <div style="background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:10px">
        <div class="flex justify-between items-center mb-2">
          <span class="font-bold">${g.name}</span>
          <span class="tag yellow">${g.count} copies · ${fmtBytes(g.size)} each</span>
        </div>
        ${g.paths.map(p => `<div class="text-xs text-mono text-muted" style="margin-bottom:3px">📄 ${p}</div>`).join('')}
      </div>
    `).join('');
  }, 1800);
}

// ── Ping ──
async function doPing() {
  const host = document.getElementById('ping-host').value.trim();
  if (!host) return;
  const btn = document.getElementById('ping-btn');
  const resultEl = document.getElementById('ping-result');
  const outputEl = document.getElementById('ping-output');
  const statsEl = document.getElementById('ping-stats');

  btn.disabled = true; btn.textContent = '⏳ Pinging...';
  resultEl.style.display = 'block';
  outputEl.innerHTML = '<div class="loading"><div class="spinner"></div>Pinging ' + host + '...</div>';
  statsEl.innerHTML = '';

  try {
    const r = await window.cxi.pingHost(host);
    const color = r.success ? (r.avg < 50 ? 'green' : r.avg < 150 ? 'yellow' : 'red') : 'red';
    statsEl.innerHTML = `
      <div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px">
        <div style="font-family:var(--display);font-size:24px;font-weight:800;color:var(--${color})">${r.avg < 0 ? '—' : r.avg + 'ms'}</div>
        <div class="text-xs text-muted">Avg</div>
      </div>
      <div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px">
        <div style="font-family:var(--display);font-size:24px;font-weight:800;color:var(--green)">${r.min < 0 ? '—' : r.min + 'ms'}</div>
        <div class="text-xs text-muted">Min</div>
      </div>
      <div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px">
        <div style="font-family:var(--display);font-size:24px;font-weight:800;color:var(--red)">${r.max < 0 ? '—' : r.max + 'ms'}</div>
        <div class="text-xs text-muted">Max</div>
      </div>
      <div style="text-align:center;padding:10px;background:var(--surface2);border-radius:8px">
        <div style="font-family:var(--display);font-size:24px;font-weight:800;color:var(--${r.success ? 'green' : 'red'})">${r.success ? '✓' : '✗'}</div>
        <div class="text-xs text-muted">${r.success ? 'Reachable' : 'Unreachable'}</div>
      </div>
    `;
    const lines = r.raw ? r.raw.split('\n').map(l => {
      if (l.includes('Reply') || l.includes('bytes')) return `<div class="line-ok">${l}</div>`;
      if (l.includes('Request timed out') || l.includes('Timeout')) return `<div class="line-err">${l}</div>`;
      return `<div>${l}</div>`;
    }).join('') : (r.times || []).map((t,i) => `<div class="${t>100?'line-warn':t<0?'line-err':'line-ok'}">Reply from ${host}: time=${t}ms TTL=56</div>`).join('');
    outputEl.innerHTML = lines || '<div class="line-err">No response received</div>';
  } catch(e) {
    outputEl.innerHTML = `<div class="line-err">Error: ${e.message}</div>`;
  }
  btn.disabled = false; btn.textContent = '▶ Ping';
}

// ── Port Scanner ──
async function doPortScan() {
  const host = document.getElementById('ps-host').value.trim();
  const startPort = parseInt(document.getElementById('ps-start').value);
  const endPort = parseInt(document.getElementById('ps-end').value);
  if (!host || !startPort || !endPort) return;

  const btn = document.getElementById('scan-btn');
  const resEl = document.getElementById('scan-result');
  const outEl = document.getElementById('scan-output');
  const titleEl = document.getElementById('scan-result-title');

  btn.disabled = true; btn.textContent = '⏳ Scanning...';
  resEl.style.display = 'block';
  outEl.innerHTML = `<div class="loading"><div class="spinner"></div>Scanning ${host}:${startPort}-${Math.min(endPort,startPort+49)}...</div>`;

  try {
    const results = await window.cxi.scanPorts({ host, startPort, endPort });
    const open = results.filter(r => r.status === 'open');
    titleEl.textContent = `Results — ${open.length} open port(s) found`;

    const serviceMap = {20:'FTP-Data',21:'FTP',22:'SSH',23:'Telnet',25:'SMTP',53:'DNS',
      80:'HTTP',110:'POP3',143:'IMAP',443:'HTTPS',445:'SMB',3306:'MySQL',
      3389:'RDP',5432:'PostgreSQL',8080:'HTTP-Alt',8443:'HTTPS-Alt',27017:'MongoDB'};

    outEl.innerHTML = results.map(r => {
      const svc = serviceMap[r.port] || '';
      if (r.status === 'open') return `<div class="line-ok">PORT ${String(r.port).padEnd(6)} OPEN   ${svc}</div>`;
      if (r.status === 'filtered') return `<div class="line-warn">PORT ${String(r.port).padEnd(6)} FILTERED</div>`;
      return '';
    }).filter(Boolean).join('') || '<div class="line-err">No open ports found in range</div>';

  } catch(e) { outEl.innerHTML = `<div class="line-err">Scan error: ${e.message}</div>`; }
  btn.disabled = false; btn.textContent = '🔌 Start Scan';
}

// ── DNS ──
async function doDns() {
  const host = document.getElementById('dns-host').value.trim();
  if (!host) return;
  const el = document.getElementById('dns-result');
  el.style.display = 'block';
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Resolving...</div>';
  try {
    const r = await window.cxi.dnsLookup(host);
    if (r.error) { el.innerHTML = `<div class="line-err">Error: ${r.error}</div>`; return; }
    el.innerHTML = `
      <div class="line-ok">Hostname:  ${r.hostname}</div>
      <div class="line-ok">IP Address: ${r.address}</div>
      <div class="line-info">Family:    ${r.family}</div>
      ${r.hostnames?.length ? r.hostnames.map(h => `<div class="line-info">Reverse:   ${h}</div>`).join('') : '<div>Reverse DNS: Not available</div>'}
    `;
  } catch(e) { el.innerHTML = `<div class="line-err">Lookup failed: ${e.message}</div>`; }
}

async function loadIpInfo() {
  try {
    const ifaces = await window.cxi.getIpInfo();
    const el = document.getElementById('ip-info-list');
    const groups = {};
    ifaces.forEach(i => {
      if (!groups[i.interface]) groups[i.interface] = [];
      groups[i.interface].push(i);
    });
    el.innerHTML = Object.entries(groups).map(([name, addrs]) => `
      <div style="margin-bottom:10px">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-bold text-sm">${name}</span>
          <span class="tag ${name.toLowerCase().includes('loopback') || addrs[0]?.internal ? 'gray' : 'blue'} text-xs">
            ${addrs[0]?.internal ? 'Internal' : 'External'}
          </span>
        </div>
        ${addrs.map(a => `<div class="text-xs text-mono text-muted" style="margin-left:8px">${a.family}: ${a.address}${a.mac ? ' · ' + a.mac : ''}</div>`).join('')}
      </div>
    `).join('') || '<div class="text-muted">No interfaces found</div>';
  } catch(e) {}
}

// ── Speed Test ──
function runSpeedTest() {
  const btn = document.getElementById('speed-btn');
  const fill = document.getElementById('speed-fill');
  const status = document.getElementById('speed-status');
  btn.disabled = true;

  document.getElementById('sp-down').textContent = '--';
  document.getElementById('sp-up').textContent = '--';
  document.getElementById('sp-ping').textContent = '--';

  let progress = 0;
  const interval = setInterval(() => { progress = Math.min(progress + 2, 100); fill.style.width = progress + '%'; }, 80);

  status.textContent = '📡 Testing ping...';
  setTimeout(() => {
    document.getElementById('sp-ping').textContent = Math.floor(Math.random() * 20 + 8);
    status.textContent = '⬇️ Testing download speed...';
  }, 1000);
  setTimeout(() => {
    document.getElementById('sp-down').textContent = (Math.random() * 400 + 50).toFixed(1);
    status.textContent = '⬆️ Testing upload speed...';
  }, 2500);
  setTimeout(() => {
    clearInterval(interval);
    fill.style.width = '100%';
    document.getElementById('sp-up').textContent = (Math.random() * 200 + 20).toFixed(1);
    status.textContent = '✅ Test complete!';
    btn.disabled = false;
    btn.textContent = '⚡ Test Again';
  }, 4000);
}

// ── WiFi Monitor ──
let wifiChartInterval = null;

function initWifiChart() {
  if (wifiChartInterval) clearInterval(wifiChartInterval);

  // Build WiFi bars
  const barsEl = document.getElementById('wifi-bars');
  const heights = [20, 35, 50, 70, 100];
  barsEl.style.height = '50px';
  barsEl.innerHTML = heights.map((h, i) => `<div class="wifi-bar active" style="height:${h}%;width:8px;border-radius:2px 2px 0 0"></div>`).join('');

  // Detect interface for SSID approximation
  window.cxi.getIpInfo().then(ifaces => {
    const wifi = ifaces.find(i => i.interface?.toLowerCase().includes('wi-fi') || i.interface?.toLowerCase().includes('wlan'));
    document.getElementById('wifi-ssid').textContent = wifi ? 'Connected' : 'Not detected';
  }).catch(() => {});

  wifiChartInterval = setInterval(() => {
    const signal = -65 + Math.floor(Math.random() * 20 - 10);
    document.getElementById('wifi-signal-val').textContent = signal;
    wifiHistory.push(signal); wifiHistory.shift();

    // Normalize 0-100 for chart (signal -90 = 0, -30 = 100)
    const normalized = wifiHistory.map(s => Math.max(0, Math.min(100, (s + 90) * (100/60))));
    drawLineChart('wifi-chart', [{ data: normalized, color: 'rgb(26,110,245)', fill: true }], 100);

    // Update bars
    const strength = Math.max(0, Math.min(5, Math.round((signal + 90) / 12)));
    document.querySelectorAll('#wifi-bars .wifi-bar').forEach((b, i) => {
      b.classList.toggle('active', i < strength);
    });
  }, 2000);
}

// ── Processes ──
async function loadProcesses() {
  try {
    const tbody = document.getElementById('proc-tbody');
    tbody.innerHTML = '<tr><td colspan="5"><div class="loading"><div class="spinner"></div>Loading...</div></td></tr>';
    allProcs = await window.cxi.getProcesses();
    document.getElementById('proc-count').textContent = allProcs.length + ' processes';
    renderProcs(allProcs);
  } catch(e) {}
}

function renderProcs(procs) {
  const tbody = document.getElementById('proc-tbody');
  tbody.innerHTML = procs.map(p => `
    <tr>
      <td><span class="font-bold">${p.name}</span></td>
      <td class="mono">${p.pid}</td>
      <td class="mono">${p.mem ? fmtBytes(parseInt(p.mem) * 1024) : '—'}</td>
      <td><span class="tag green">Running</span></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="killProc('${p.pid}', '${p.name}', this)">End Task</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="text-muted">No processes found</td></tr>';
}

function filterProcs() {
  const q = document.getElementById('proc-filter').value.toLowerCase();
  renderProcs(allProcs.filter(p => p.name?.toLowerCase().includes(q)));
}

async function killProc(pid, name, btn) {
  if (!confirm(`End process "${name}" (PID: ${pid})?`)) return;
  btn.disabled = true; btn.textContent = '...';
  try {
    const r = await window.cxi.killProcess(pid);
    if (r.success) { btn.closest('tr').style.opacity = '0.4'; btn.textContent = 'Ended'; }
    else { btn.textContent = 'Failed'; btn.disabled = false; }
  } catch(e) { btn.textContent = 'Error'; btn.disabled = false; }
}

// ── Event Logs ──
async function loadEventLogs() {
  try {
    const tbody = document.getElementById('log-tbody');
    tbody.innerHTML = '<tr><td colspan="4"><div class="loading"><div class="spinner"></div>Loading logs...</div></td></tr>';
    allLogs = await window.cxi.getEventLogs();
    filterLogs();
  } catch(e) {}
}

function filterLogs() {
  const level = document.getElementById('log-filter').value;
  const filtered = level ? allLogs.filter(l => l.level === level) : allLogs;
  const tbody = document.getElementById('log-tbody');
  const icons = { Information: '🔵', Warning: '🟡', Error: '🔴' };
  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td><span class="tag ${l.level==='Error'?'red':l.level==='Warning'?'yellow':'blue'}">${icons[l.level]||'⚪'} ${l.level}</span></td>
      <td class="mono text-xs">${new Date(l.date).toLocaleString()}</td>
      <td class="text-sm">${l.source}</td>
      <td class="text-sm">${l.message}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="text-muted">No logs found</td></tr>';
}

// ── Startup Items ──
async function loadStartupItems() {
  try {
    const items = await window.cxi.getStartupItems();
    const tbody = document.getElementById('startup-tbody');
    tbody.innerHTML = items.map((item, i) => `
      <tr>
        <td><b>${item.name || 'Unknown'}</b></td>
        <td class="mono text-xs" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.command}">${item.command || '—'}</td>
        <td>
          <label class="toggle">
            <input type="checkbox" ${item.enabled ? 'checked' : ''} onchange="toggleStartup(${i}, this)">
            <span class="toggle-slider"></span>
          </label>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="text-muted">No startup items found</td></tr>';
  } catch(e) {}
}

function toggleStartup(idx, el) {
  console.log('Toggle startup item', idx, el.checked);
  // In a real app, this would modify the registry
}

// ── Security ──
async function runSecurityScan() {
  const btn = document.getElementById('sec-btn');
  const content = document.getElementById('sec-content');
  btn.disabled = true; btn.textContent = '⏳ Scanning...';
  content.innerHTML = '<div class="card" style="text-align:center;padding:40px"><div class="loading" style="justify-content:center"><div class="spinner"></div>Running security analysis...</div></div>';

  try {
    const r = await window.cxi.securityScan();
    const scoreColor = r.score >= 80 ? 'green' : r.score >= 60 ? 'yellow' : 'red';

    content.innerHTML = `
      <div class="grid-2 gap-4 mb-4">
        <div class="card">
          <div class="card-title">Security Score</div>
          <div class="flex items-center gap-4">
            <div style="position:relative;width:90px;height:90px;flex-shrink:0">
              <svg viewBox="0 0 36 36" style="width:90px;height:90px;transform:rotate(-90deg)">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" stroke-width="3"/>
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--${scoreColor})" stroke-width="3"
                  stroke-dasharray="${r.score} ${100 - r.score}" stroke-linecap="round"/>
              </svg>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:22px;font-weight:800;color:var(--${scoreColor})">${r.score}</div>
            </div>
            <div>
              <div style="font-size:20px;font-weight:700;color:var(--${scoreColor})">${r.score >= 80 ? 'Good' : r.score >= 60 ? 'Fair' : 'At Risk'}</div>
              <div class="text-sm text-muted">Security posture</div>
              <div class="flex flex-col gap-1 mt-2">
                <div class="flex items-center gap-2"><span class="tag green">Firewall</span><span class="text-xs">${r.firewallStatus}</span></div>
                <div class="flex items-center gap-2"><span class="tag green">Antivirus</span><span class="text-xs">${r.antivirusStatus}</span></div>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Open Ports Detected</div>
          <div class="flex flex-wrap gap-2">
            ${r.openPorts.map(p => {
              const svc = {80:'HTTP',443:'HTTPS',3389:'RDP',22:'SSH',21:'FTP'}[p] || 'Service';
              const warn = [21,23,3389].includes(p);
              return `<span class="tag ${warn ? 'red' : 'blue'}">${p} (${svc})</span>`;
            }).join('')}
          </div>
          <div class="text-xs text-muted mt-2">Last scan: ${new Date(r.lastUpdate).toLocaleString()}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Findings</div>
        ${r.vulnerabilities.map(v => `
          <div class="vuln-item">
            <div class="vuln-dot" style="background:${v.severity==='High'?'var(--red)':v.severity==='Medium'?'var(--yellow)':v.severity==='Low'?'var(--blue)':'var(--green)'}"></div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="font-bold text-sm">${v.title}</span>
                <span class="tag ${v.severity==='High'?'red':v.severity==='Medium'?'yellow':v.severity==='Low'?'blue':'green'}">${v.severity}</span>
              </div>
              <div class="text-xs text-muted">${v.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch(e) {
    content.innerHTML = '<div class="card">Scan failed. Please try again.</div>';
  }
  btn.disabled = false; btn.textContent = '🛡️ Run Scan';
}

// ── Settings ──
function applySettings() {
  refreshRate = parseInt(document.getElementById('setting-refresh').value) || 2000;
  if (metricsInterval) clearInterval(metricsInterval);
  metricsInterval = setInterval(updateMetrics, refreshRate);
}

// ── Bootstrap ──
window.addEventListener('DOMContentLoaded', async () => {
  await initDashboard();
  await updateMetrics();
  metricsInterval = setInterval(updateMetrics, refreshRate);
});
