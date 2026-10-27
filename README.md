# FLOOR GUARD — An IoT-Based Smart Anti-Theft Floor Mat System

![FLOOR GUARD Status](https://img.shields.io/badge/Status-Operational%20v1.0-35E0D0?style=for-the-badge)
![Tech Expo 2026](https://img.shields.io/badge/Exhibition-Tech%20Expo%202026-438BFF?style=for-the-badge)
![PSIT Kanpur](https://img.shields.io/badge/Institution-PSIT%20Kanpur-36D399?style=for-the-badge)
![Team 5G](https://img.shields.io/badge/Team-Five%20Glitchbreakers-F6BD60?style=for-the-badge)

> **"Security Starts at the Floor."**  
> Detect footsteps. Trigger alerts. Verify activity. Protect the spaces that matter.

---

## 📌 Project Overview
**FLOOR GUARD** is an IoT-based smart anti-theft floor mat security system combining mechanical stress sensing, edge microcontroller signal processing, local audio-visual deterrence, wireless telemetry, and real-time computer vision identity verification.

Developed by **Team 5G — Five Glitchbreakers** (DevQBX) from **Pranveer Singh Institute of Technology (PSIT), Kanpur** for **Tech Expo 2026**.

### Engineering Team:
1. **Adarsh Srivastava** (Leader)
2. **Ankit Yadav**
3. **Kushagra Awasthi**
4. **Abhishek Pandey**
5. **Arpit Chaturvedi**

---

## 🚀 Key Features

### 1. Dual-Page Operational Architecture
- **Home Page (`/`)**: Striking security presentation highlighting the real-world problem statement (Goa Arpora Villa theft incident), existing security limitations (locks, CCTV, PIR, doorbells), the 6-phase operational workflow, itemized component bill of materials (₹ 2,380/-), system schematic architecture, 6 application domains, future roadmap, and academic citations.
- **Face Recognition Security Center (`/security`)**: Real-time operations console featuring:
  - Real browser camera feed via `navigator.mediaDevices.getUserMedia()`.
  - Computer Vision engine toggle: **Face-API (ResNet-34 128-d Biometric Verification)** vs. **Google MediaPipe Tasks Vision (BlazeFace)**.
  - Aligned SVG detection overlay displaying confidence scores, 68 landmark points, and color-coded status badges (Green for known reference match, Amber for unknown individual, Cyan for detected presence).
  - Consent-based reference profile enrollment with 128-d descriptor extraction.
  - Multi-sensor audit log with WebSocket live event streaming, search, filters, CSV export, and operator acknowledgment.
  - Interactive demonstration controls to simulate piezoelectric footstep spikes and test synthetic buzzer alarms using Web Audio API.

### 2. Original Custom Logo & Visual Design System
- Custom SVG logo combining a protective security shield, floor mat perspective grid lines, a pressure-detection footprint motif, and IoT concentric signal waves.
- Deep midnight color scheme (`#080D18`, `#101827`, `#151F30`) with electric cyan (`#35E0D0`) and signal blue (`#438BFF`) accents.
- Responsive mobile-first design tested across mobile, tablet, and desktop viewports.

### 3. Rigorous Technical & Hardware Distinctions
- Clearly separates **DEMO MODE** from **LIVE DEVICE CONNECTED**.
- Adheres to technical distinctions: footstep pressure $\neq$ crime; detected face $\neq$ thief.
- Itemized prototype BOM (₹2,380/-) separated from commercial production and maintenance costs.

---

## 🛠️ Hardware Bill of Materials (₹ 2,380 Total)

| # | Component | Specification | Role | Cost (₹) |
|---|---|---|---|---|
| 01 | Arduino UNO R3 | ATmega328P (16 MHz) | Main analog signal processor | ₹ 550 |
| 02 | Piezoelectric Sensor | 35mm Brass Disc | Vibration & pressure transducer | ₹ 30 |
| 03 | ESP8266 NodeMCU | Tensilica 32-bit Wi-Fi | Wireless telemetry gateway | ₹ 250 |
| 04 | ESP32-CAM Module | OV2640 2MP Camera | Visual verification stream | ₹ 450 |
| 05 | 16×2 LCD Display | HD44780 Driver | Local status display | ₹ 180 |
| 06 | Active Buzzer (5V) | ~2.3 kHz (85dB) | Immediate audible alarm | ₹ 30 |
| 07 | Micro Servo Motor | SG90 (180°) | Optional mechanical latch lock | ₹ 160 |
| 08 | Push Button Switch | Tactile Input | User reset / calibration | ₹ 10 |
| 09 | Perf Board + Wires | Prototyping Board | Circuit connections | ₹ 100 |
| 10 | 5V Power Supply | LM7805 Linear Regulator | Voltage regulation | ₹ 150 |
| 11 | Connecting Wires | Jumper wires, Misc. | Interconnects | ₹ 70 |

---

## 💻 Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide React.
- **Computer Vision**: Face-API (`@vladmandic/face-api`) and Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision`).
- **Backend**: Node.js, Express, WebSocket (`ws`), persistent JSON database store.
- **Testing**: Vitest (17 passing unit & integration tests).

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start full-stack (Vite on :5173, Express + WS on :3001)
npm start

# 3. Run automated tests
npm test

# 4. Production build
npm run build
```

---

## 📚 Technical Documentation
- [Architecture Pipeline](docs/architecture.md)
- [REST & WebSocket API Reference](docs/api.md)
- [Hardware & IoT Integration Guide](docs/device-integration.md)
- [Setup & Deployment Guide](docs/setup.md)

This is a full functional and operational FLOORGUARD website.
