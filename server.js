/**
 * server.js — JanSetu AI All-In-One Unified Server
 * ═══════════════════════════════════════════════════════════════════════════
 * Starts ALL 4 JanSetu AI services simultaneously in ONE command:
 *   1. Backend REST API           -> /api/*
 *   2. Public Citizen Portal      -> / (and port 3000 locally)
 *   3. Authority Command Portal   -> /authority (and port 3002 locally)
 *   4. Citizen WhatsApp Bot       -> port 3001 & background Baileys connection
 *
 * Designed for 1-Click Render Cloud Hosting & Seamless Local Development.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

// Load environment variables from root, backend, and whatsapp-bot
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
require('dotenv').config({ path: path.join(__dirname, 'whatsapp-bot', '.env') });

const express = require('express');
const cors = require('cors');

// Backend dependencies
const config = require('./backend/src/config');
const { apiRateLimiter } = require('./backend/src/middleware/rateLimiter');
const { globalErrorHandler } = require('./backend/src/middleware/errorHandler');

const signalsRoutes = require('./backend/src/routes/signals');
const issuesRoutes = require('./backend/src/routes/issues');
const projectsRoutes = require('./backend/src/routes/projects');
const analyticsRoutes = require('./backend/src/routes/analytics');
const copilotRoutes = require('./backend/src/routes/copilot');
const authRoutes = require('./backend/src/routes/auth');

const app = express();
const MAIN_PORT = process.env.PORT || 5000;
const IS_RENDER = !!process.env.RENDER;

// Enable Global CORS & Body Parsers
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Cloud Health Check for Render Probes
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ONLINE',
    system: 'JanSetu AI Unified Full-Stack Platform',
    services: {
      backend: 'ONLINE',
      citizenWeb: 'ONLINE',
      authorityWeb: 'ONLINE',
      whatsappBot: 'ONLINE'
    },
    environment: process.env.NODE_ENV || 'production',
    gemini_configured: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Serve Uploaded Media
app.use('/uploads', express.static(path.join(__dirname, 'backend', 'data', 'uploads')));

// ─── API Routes (Rate Limited) ──────────────────────────────────────────────
app.use('/api', apiRateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/copilot', copilotRoutes);

// Dynamic Config endpoint for client frontends
app.get('/api/config', (_req, res) => {
  res.json({
    apiBase: '/api',
    appName: 'JanSetu AI',
    version: '1.0.0'
  });
});

// ─── Direct WhatsApp Bot Integration on Unified Server ──────────────────────
let waBot = null;
try {
  const waRoutes = require('./whatsapp-bot/routes/news');
  app.use('/', waRoutes);

  waBot = require('./whatsapp-bot/bot/whatsapp');
  console.log('  🤖 Initializing Citizen WhatsApp Bot in Unified Server process...');
  waBot.connect().catch((err) => {
    console.warn('  ⚠️ [WhatsApp Bot Startup Notice]:', err.message);
  });
} catch (e) {
  console.warn('[WhatsApp Bot Routes] Mount notice:', e.message);
}

// ─── Authority Web Portal Mounting ─────────────────────────────────────────
const authorityPublicDir = path.join(__dirname, 'authority-web', 'public');

app.get('/authority', (_req, res) => {
  res.sendFile(path.join(authorityPublicDir, 'login.html'));
});

app.get('/authority/login', (_req, res) => {
  res.sendFile(path.join(authorityPublicDir, 'login.html'));
});

app.get('/authority/dashboard', (_req, res) => {
  res.sendFile(path.join(authorityPublicDir, 'index.html'));
});

app.use('/authority', express.static(authorityPublicDir));

// ─── Citizen Public Portal Mounting ────────────────────────────────────────
const citizenPublicDir = path.join(__dirname, 'public-web', 'public');

app.get('/', (_req, res) => {
  res.sendFile(path.join(citizenPublicDir, 'login.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(citizenPublicDir, 'login.html'));
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(citizenPublicDir, 'index.html'));
});

app.get('/track', (_req, res) => {
  res.sendFile(path.join(citizenPublicDir, 'track.html'));
});

app.use(express.static(citizenPublicDir));

// ─── Auto-Escalation Engine ────────────────────────────────────────────────
try {
  const { runEscalationCheck } = require('./backend/src/services/escalation/escalationEngine');
  const result = runEscalationCheck();
  if (result.escalated > 0) console.log(`[Escalation] Auto-escalated ${result.escalated} overdue cases.`);
  
  setInterval(() => {
    try { runEscalationCheck(); } catch(e) {}
  }, 6 * 60 * 60 * 1000);
} catch (e) {
  console.warn('[Escalation] Startup check notice:', e.message);
}

// ─── Global Error Handler ───────────────────────────────────────────────────
app.use(globalErrorHandler);

// ─── Start Main Unified Server ──────────────────────────────────────────────
app.listen(MAIN_PORT, '0.0.0.0', () => {
  console.log('\n================================================================');
  console.log('  🇮🇳 JanSetu AI — All-In-One Unified Server Started');
  console.log('================================================================');
  console.log(`  🌐 Main Platform URL:     http://localhost:${MAIN_PORT}`);
  console.log(`  👥 Public Citizen Web:    http://localhost:${MAIN_PORT}/`);
  console.log(`  🏛️ Authority Command:     http://localhost:${MAIN_PORT}/authority`);
  console.log(`  ⚡ Central REST API:       http://localhost:${MAIN_PORT}/api/signals`);
  console.log(`  📋 Health Check Probe:    http://localhost:${MAIN_PORT}/health`);
  console.log('----------------------------------------------------------------');
});

// ─── Local Convenience Port Listeners (3000, 3001, 3002) ───────────────────
// If running locally, also bind dedicated ports so all legacy URLs work instantly
if (!IS_RENDER) {
  // Port 3000: Citizen Public Web
  if (MAIN_PORT != 3000) {
    try {
      const pubApp = express();
      pubApp.use(express.static(citizenPublicDir));
      pubApp.get('/', (_r, res) => res.sendFile(path.join(citizenPublicDir, 'login.html')));
      pubApp.get('/login', (_r, res) => res.sendFile(path.join(citizenPublicDir, 'login.html')));
      pubApp.get('/dashboard', (_r, res) => res.sendFile(path.join(citizenPublicDir, 'index.html')));
      pubApp.get('/track', (_r, res) => res.sendFile(path.join(citizenPublicDir, 'track.html')));
      pubApp.listen(3000, '0.0.0.0', () => {
        console.log('  ✨ Dedicated Citizen Port: http://localhost:3000/');
      }).on('error', () => {});
    } catch (e) {}
  }

  // Port 3002: Authority Command Web
  if (MAIN_PORT != 3002) {
    try {
      const authApp = express();
      authApp.use(express.static(authorityPublicDir));
      authApp.get('/', (_r, res) => res.sendFile(path.join(authorityPublicDir, 'login.html')));
      authApp.get('/login', (_r, res) => res.sendFile(path.join(authorityPublicDir, 'login.html')));
      authApp.get('/dashboard', (_r, res) => res.sendFile(path.join(authorityPublicDir, 'index.html')));
      authApp.listen(3002, '0.0.0.0', () => {
        console.log('  ✨ Dedicated Authority:    http://localhost:3002/');
      }).on('error', () => {});
    } catch (e) {}
  }
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────
function handleShutdown() {
  console.log('\n[JanSetu AI] Graceful shutdown initiated...');
  if (waBot) {
    try {
      const c = waBot.getClient();
      if (c) c.destroy();
    } catch (e) {}
  }
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
