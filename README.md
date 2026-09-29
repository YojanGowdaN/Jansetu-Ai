# JanSetu AI — Citizen Development Intelligence & Priority Platform

**A Multilingual, Multimodal Digital Public Infrastructure (DPI) for Government Adoption**

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-emerald.svg)](https://nodejs.org/)
[![Google Gemini AI](https://img.shields.io/badge/Google_Gemini-Multimodal_AI-blue.svg)](https://ai.google.dev/)
[![Digital Public Infrastructure](https://img.shields.io/badge/DPI-Compliant-saffron.svg)](#-governance--licensing-model)

---

## 🇮🇳 Executive Overview

**JanSetu AI** (ಜನಸೇತು / जनसेतु) is a state-and-national-level **Digital Public Infrastructure (DPI)** designed to bridge the critical gap between citizen-reported civic grievances and evidence-backed public investment allocation.

Citizens report civic defects and development needs via **WhatsApp** or the **Citizen Web Portal** using regional languages (Kannada, Hindi, English, Tamil, Telugu, Marathi, and 10+ Indian languages) across **Text, Voice Notes, Photos, and GPS Locations**. **JanSetu AI** fuses these citizen signals with real national datasets — including **PMGSY (Pradhan Mantri Gram Sadak Yojana)** rural road records, **Census 2011 & SECC** demographic vulnerability matrices, and **NITI Aayog Aspirational Districts** deprivation scores — to identify infrastructure hotspots and calculate an **Explainable 6-Factor Priority Score** for government authorities from Field Engineers to National Policymakers.

---

## 🚀 Key Features

### 1. 📲 Multimodal Citizen Intake (WhatsApp Bot + Web Portal)
- **Voice-First Accessibility**: Voice note transcription and understanding powered by **Gemini AI** with automatic language detection (Kannada, Hindi, English, etc.).
- **Photo Evidence & AI Damage Analysis**: Analyzes defect severity, hazard level, and road/water damage automatically.
- **Location Pinpoint**: Instant GPS reverse geocoding with OpenStreetMap Nominatim and Local Government Directory (LGD) mapping.
- **Instant WhatsApp Registration Receipts**: Real-time receipt message delivered to WhatsApp containing ticket reference (`JS-2026-XXXXX`), category, location, and tracking links.
- **Real-Time WhatsApp Status Updates**: When officers take action or write notes on the Authority Portal, Gemini AI generates a multilingual explanation and delivers it instantly to the citizen's WhatsApp.
- **Unified Request Tracking**: Complaints submitted via WhatsApp and Web Portal appear together under the citizen's authenticated *"My Submitted Requests"* dashboard.

### 2. 🛡️ DPI Security & Identity
- **Interactive Visual Canvas CAPTCHA**: Dynamic alphanumeric security verification on Sign In and Registration to prevent bot spam and DDoS attacks.
- **WhatsApp OTP Phone Verification**: 6-digit cryptographic OTP sent directly to the citizen's WhatsApp to verify phone ownership during registration.
- **Passwordless WhatsApp Login**: One-tap sign in using a WhatsApp OTP code.
- **All-India Cascading Dropdowns**: Covers all **28 States and 8 Union Territories** with dynamically populated district lists.

### 3. ⚖️ Explainable 6-Factor Priority Engine
Ranks civic hotspots using a transparent, 100-point formula with full source attribution:

$$\text{Priority Score} = 0.30(D) + 0.20(P) + 0.20(I) + 0.15(S) + 0.10(U) + 0.05(E)$$

| Factor | Weight | Source / Evidence Basis |
|---|---|---|
| **Citizen Demand ($D$)** | **30%** | Normalized signal density per locality |
| **Population Affected ($P$)** | **20%** | Census 2011 / SECC village population count |
| **Infrastructure Gap ($I$)** | **20%** | NITI Aayog Aspirational District Deprivation Score (with source attribution) |
| **Severity ($S$)** | **15%** | Gemini AI damage assessment & disruption tier |
| **Urgency / Surge ($U$)** | **10%** | 60-day surge velocity in citizen signals |
| **Evidence Confidence ($E$)** | **5%** | Multimodal evidence verification (Text + Image + Voice + GPS) |

### 4. 🏛️ Authority Command Dashboard & 5-Tier RBAC
- **Tier 1: Field Officer (AEE)**: Ground inspection, GPS verification, status updates.
- **Tier 2: Department Officer (EE)**: Departmental resource allocation, contractor notices.
- **Tier 3: District Authority (DC/DM)**: District heatmaps, budget allocation, officer provisioning.
- **Tier 4: State Authority (Secretary)**: State-wide infrastructure tracking, inter-district prioritization.
- **Tier 5: National Policymaker (Ministry)**: National rollups, aspirational district monitoring.
- **Interactive Light Map & Google Maps Navigation**: Real-time Leaflet map with one-click Google Maps navigation for on-ground inspection.
- **Government Officer Provisioning Ledger**: In-portal officer allocation and credential management.

---

## 🔄 Core Loop & System Flow

```mermaid
flowchart TD
    A[Citizen Input: Text / Voice / Photo / GPS] -->|WhatsApp / Web| B(1. Security: CAPTCHA + WhatsApp OTP)
    B --> C(2. Gemini AI Multimodal Processing)
    C --> D(3. Defect & PMGSY Warranty Matcher)
    D --> E(4. NITI Aayog & Census 6-Factor Priority Engine)
    E --> F(5. Instant WhatsApp Registration Receipt Sent)
    E --> G[Authority Command Portal: 5-Tier RBAC]
    G -->|Officer Updates Status & Notes| H(6. Gemini Multilingual Action Analysis)
    H -->|Instant Outbound WhatsApp Delivery| I[Citizen WhatsApp: Live Status Notification]
    E --> J[Public Web Portal: Live Scorecard & Timeline Tracking]
```

---

## 🛠️ Project Structure

```
jansetu-ai/
├── whatsapp-bot/             ← Citizen WhatsApp Intake Bot (Node.js + whatsapp-web.js + Gemini)
│   ├── bot/                  ← WhatsApp connection, QR handler, outbound delivery engine
│   ├── routes/               ← Outbound status notifications & WhatsApp OTP endpoints
│   ├── services/             ← Gemini multimodal dialogue & conversational session state
│   └── server.js             ← WhatsApp Bot microservice (Port 3001)
├── backend/                  ← Core REST API Engine (Node.js + Express)
│   ├── src/
│   │   ├── routes/           ← Signals, Issues, Analytics, Copilot, Auth (OTP + CAPTCHA)
│   │   ├── services/
│   │   │   ├── ai/           ← Gemini AI classifier, speech service, 6-Factor priority engine
│   │   │   ├── data/         ← Central DB service, National GeoService, NITI Aayog service
│   │   │   ├── matching/     ← PMGSY Warranty Defect Matcher
│   │   │   ├── escalation/   ← Auto-escalation SLA engine
│   │   │   └── notifications/← Notification dispatcher
│   │   ├── middleware/       ← JWT Auth, RBAC, Rate limiting, Uploads
│   │   └── config/           ← Escalation rules & environment settings
│   ├── data/                 ← JSON persistence (signals.json, users.json, issues.json)
│   └── server.js             ← Backend API server (Port 5000)
├── public-web/               ← Citizen Public Portal (HTML5 + Tailwind CSS + Leaflet)
│   ├── public/
│   │   ├── index.html        ← Citizen dashboard, GPS map, speech recorder, My Requests
│   │   ├── login.html        ← State-District dropdowns, CAPTCHA, WhatsApp OTP Modal
│   │   └── track.html        ← Public complaint tracking timeline
│   └── server.js             ← Public Web server (Port 3000)
├── authority-web/            ← Authority Command Portal (HTML5 + Tailwind CSS + Leaflet)
│   ├── public/
│   │   ├── index.html        ← Hotspot Map, Priority Scorecard, Officer Admin, Signals Table
│   │   └── login.html        ← Government officer sign in
│   └── server.js             ← Authority Portal server (Port 3002)
├── data/
│   ├── real/                 ← Real PMGSY, Census 2011/SECC, NITI Aayog Datasets
│   └── demo/                 ← Demonstration infrastructure assets & sample signals
├── LICENSE                   ← MIT License
├── .env.example              ← Environment template
└── README.md                 ← Comprehensive documentation
```

---

## 🌐 Microservices & Ports

| Service | Port | Description | URL |
|---|---|---|---|
| **Backend API** | `5000` | Central REST API, Gemini AI Engine & Database | `http://localhost:5000` |
| **Citizen Public Portal** | `3000` | Citizen Reporting, Live Map, OTP Registration & Tracking | `http://localhost:3000` |
| **WhatsApp Bot** | `3001` | WhatsApp Web Scanner, Session Manager & Outbound Notifier | `http://localhost:3001` |
| **Authority Command Web** | `3002` | Officer Triage, Hotspot Heatmap & Admin Ledger | `http://localhost:3002` |

---

## ⚡ Quick Start & Execution Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Google Gemini API Key**: [Google AI Studio](https://aistudio.google.com/)

### 2. Configure Environment
Create a `.env` file in `backend/` and `whatsapp-bot/` (or use the root `.env`):
```env
PORT=5000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
JWT_SECRET=jansetu_super_secret_jwt_key_2026
```

### 3. Start the Backend Engine
```powershell
cd backend
npm install
npm start
```
*Backend runs on `http://localhost:5000` (Health Check: `http://localhost:5000/health`)*

### 4. Start the Citizen Public Web Portal
```powershell
cd public-web
npm install
npm start
```
*Open `http://localhost:3000` in your browser.*

### 5. Start the Authority Command Portal
```powershell
cd authority-web
npm install
npm start
```
*Open `http://localhost:3002` in your browser.*

### 6. Start the Citizen WhatsApp Bot
```powershell
cd whatsapp-bot
npm install
npm start
```
*Scan the terminal QR code using WhatsApp (*Linked Devices $\rightarrow$ Link a Device*).*

---

## 🔑 Default Demonstration Credentials

### Citizen Accounts:
- **Email**: `citizen@demo.com` | **Password**: `citizen123`
- Or register your own account using your **Mobile Number + WhatsApp OTP + CAPTCHA**!

### Authority Accounts:
- **Tier 1 (Field Officer)**: `field@jansetu.gov.in` | **Password**: `field123`
- **Tier 2 (Department Officer)**: `dept@jansetu.gov.in` | **Password**: `dept123`
- **Tier 3 (District Magistrate / DC)**: `dc@jansetu.gov.in` | **Password**: `dc123`
- **Tier 4 (State Authority / Secretary)**: `state@jansetu.gov.in` | **Password**: `state123`
- **Tier 5 (National Policymaker)**: `national@jansetu.gov.in` | **Password**: `national123`

---

## 📡 API Reference

### Authentication & Security
- `POST /api/auth/send-otp`: Dispatches a 6-digit cryptographic OTP to citizen WhatsApp.
- `POST /api/auth/verify-otp-login`: Verifies WhatsApp OTP and authenticates user.
- `POST /api/auth/citizen-register`: Creates a citizen profile with State/District and verified phone.
- `POST /api/auth/citizen-login`: Authenticates citizen with email/phone and password.
- `POST /api/auth/authority-login`: Authenticates government officials with role-based JWT.
- `GET /api/auth/officers`: Lists all provisioned government officers (Tier 3+).

### Signals & Citizen Intelligence
- `POST /api/signals/ingest`: Submits text, photo, voice note, and GPS coordinates with automated WhatsApp receipt dispatch.
- `GET /api/signals`: Lists all signals (filtered by state/district jurisdiction).
- `GET /api/signals/my-requests/:citizenId`: Returns all complaints submitted by the citizen across WhatsApp and Web.
- `GET /api/signals/track/:refNumber`: Returns privacy-safe public tracking timeline.
- `PATCH /api/signals/:refNumber/status`: Updates ticket status, runs Gemini multilingual analysis, and delivers notifications to WhatsApp.

### Analytics & NITI Aayog
- `GET /api/analytics/national-rollup`: Multi-state ranked list of development hotspots.
- `GET /api/analytics/scorecard`: Public transparency performance metrics.
- `GET /api/analytics/niti-indicators/:district`: District-level NITI Aayog infrastructure metrics.
- `GET /api/analytics/budget-recommendations`: AI-driven public expenditure recommendations.
- `POST /api/copilot/query`: AI Policy Copilot for government officers.

---

## 📜 License & Governance

JanSetu AI is open-sourced under the **MIT License** — engineered for free government adoption and digital public good.
