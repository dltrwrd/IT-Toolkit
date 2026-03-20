# CXI SLT Toolkit

A professional Windows desktop app for IT admins — built with Electron.

## Features
- **Dashboard** — Live CPU/RAM gauges, CPU history chart, health alerts
- **System Info** — Full hardware & OS details, network interfaces
- **Storage Tools** — Disk Analyzer, SMART Health, Partition View, Duplicate Finder
- **Network Tools** — Ping, Port Scanner, DNS Lookup, Speed Test, WiFi Monitor
- **Process Manager** — Live process list with CPU/RAM usage
- **Startup Manager** — Enable/disable startup programs
- **Event Log** — Live streaming system events
- **Security Scanner** — Security posture score and checks
- **Settings** — Thresholds, alerts, preferences

## Build Instructions

### Prerequisites
- [Node.js](https://nodejs.org) v18 or higher
- npm (comes with Node.js)

### Step 1 — Install dependencies
```bash
cd "CXI SLT Toolkit"
npm install
```

### Step 2 — Run in development (no .exe, just preview)
```bash
npm start
```

### Step 3 — Build the Windows .exe installer
```bash
npm run build
```

> [!IMPORTANT]
> **Windows Users**: You MUST run your terminal as **Administrator** or enable **Developer Mode** in Windows Settings. 
> Otherwise, `electron-builder` will fail when creating symbolic links (`A required privilege is not held by the client`).

The installer will be in the `dist/` folder:
- `CXI SLT Toolkit Setup 1.0.0.exe` — full installer
- `CXI SLT Toolkit 1.0.0.exe` — portable (no install needed)

## Folder Structure
```
CXI SLT Toolkit/
├── src/
│   ├── main.js       ← Electron main process (Node.js backend)
│   ├── preload.js    ← Secure bridge between UI and Node.js
│   └── index.html    ← Full UI (HTML/CSS/JS)
├── assets/           ← Icons go here
├── package.json      ← Dependencies and build config
└── README.md
```

## Notes
- Real system metrics (CPU, RAM, hostname, network) are pulled live via Node.js `os` module
- Ping and Port Scanner use real OS commands and TCP sockets
- Some features show simulated data (Disk, WiFi) — you can extend with `systeminformation` npm package for full hardware data
