# CXI SLT Toolkit — Professional IT Diagnostics (v3.0)

A powerful, all-in-one Windows desktop utility designed for IT Administrators and Power Users. Built with Electron, it combines low-level system access with a modern, high-performance interface.

---

## 🛰️ Key Features (v3.0)

### 📈 Real-Time Network Monitoring
- **High-Precision Data**: 5-second polling interval for real-time throughput accuracy.
- **Latency Tracking**: Built-in 8.8.8.8 ICMP monitor (Purple Line) to detect lag spikes and connection drops instantly.
- **Dual Speed View**: Track Inbound vs. Outbound metrics with live "Average Consumption" data.
- **Integrated Speedtest**: Full webview integration for rapid bandwidth verification.

### 🪚 User Profile Purger (Advanced)
- **Deep System Scan**: Detects and calculates the **Literal Disk Footprint** of every user profile on the machine (System & Admin profiles included).
- **Size Accuracy**: Detects hidden `AppData`, browser caches, and temp storage that Windows often under-reports.
- **Permanent Removal**: Safely and completely purges unused profiles to reclaim hidden GBs of disk space.

### 🛡️ System Health & Diagnostics
- **Live Performance Gauges**: Modern visualizers for CPU, RAM, and Disk Space usage.
- **Active Uptime Tracker**: Real-time system boot duration monitoring.
- **Hardware Profile**: Deep detection of GPU, RAM Type (DDR), Motherboard, and BIOS information.
- **Network Reset Tool**: One-click cleanup (`Flush DNS`, `IP Release`, `IP Renew`) with native CMD feedback.

### 🔔 Smart System Alerts
- **Native OS Notifications**: Receive critical Windows alerts when hardware thresholds are hit.
- **User-Defined Thresholds**: Set your own warning limits for CPU, Memory, and Disk Usage percentage.
- **Cooldown Logic**: Smart 1-minute alert cooldown to prevent notification spam during sustained loads.

### 🚀 Privacy & Performance
- **Built-in Ad-Blocker**: Prevents tracking and intrusive ads from slowing down embedded network tools.
- **Single Instance Lock**: Ensures only one copy of the Toolkit runs at a time, preventing CPU/RAM overlap.
- **Admin-First**: Manifest-protected to ensure the app always launches with necessary system privileges.

---

## 🛠️ Build & Installation

### Prerequisites
- [Node.js](https://nodejs.org) v18 or higher (LTS recommended)
- Administrator privileges for system-level metrics collection

### Development Mode
Test the app instantly without building:
```bash
npm install
npm start
```

### Production Build
Generate your own branded installer or portable package:
```bash
npm run build
```
The output will be in the `dist/` folder:
- **Installer**: `CXI SLT Toolkit Setup 3.0.0.exe` (Full NSIS setup)
- **Portable**: `CXI SLT Toolkit-3.0.0-win.zip` (No installation needed)

---

## 📂 Project Structure
```
CXI SLT Toolkit/
├── src/
│   ├── main.js       ← Node.js Backend (IPC, SysUtils, Single Instance)
│   ├── preload.js    ← Secure IPC Bridge
│   ├── index.html    ← Frontend (v3.0 UI / App Logic)
│   └── assets/       ← Branded Logo & Icons
├── package.json      ← v3.0 Metadata & Build Config (wrdDEV)
└── README.md
```

---

## 👨‍💻 Developer Notes
- **Author**: wrdDEV
- **Platform**: Optimized specifically for Windows 10/11 Architecture.
- **Performance**: Uses `systeminformation` npm engine for hardware benchmarks.
- **Security**: Context Isolation and Preload-based IPC are strictly enforced.

---
*CXI SLT — Empowering IT Administrators with Real-Time Control.*
