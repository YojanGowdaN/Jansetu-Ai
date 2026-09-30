/**
 * bot/whatsapp.js
 * WhatsApp connection using whatsapp-web.js (Puppeteer-based).
 *
 * Features:
 *  - QR code printed to terminal on first run — scan once with your phone
 *  - Session saved to ./.wwebjs_auth/ (persists across restarts — no re-scan needed)
 *  - Auto-reconnect if the connection drops
 *  - Handles text, URL, and image caption messages
 *  - Per-sender rate limiting
 *  - Fake news analysis + formatted reply with emojis
 *  - Auto-alerts authority when confidence > threshold
 */

const qrcode          = require("qrcode-terminal");
const logger          = require("../utils/logger");
const rateLimiter     = require("../utils/rateLimiter");
const { extractUrls, getMessageType } = require("../utils/urlDetector");
const fakeNewsService = require("../services/fakeNewsService");
const alertService    = require("../services/alertService");
const { geminiBotService } = require("../services/geminiBotService");

let client = null;
const recentChats = new Map(); // identifier -> Chat object

let currentQr = null;
let isReady = false;
let connectedUser = null;
let lastError = null;
let initProgress = "Bot initializing...";
const recentLogs = [];

function recordLog(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  recentLogs.push(line);
  if (recentLogs.length > 25) recentLogs.shift();
}

const getStatus = () => ({
  ready: isReady,
  qr: currentQr,
  user: connectedUser,
  error: lastError,
  progress: initProgress,
  logs: recentLogs
});

const connect = async () => {
  const { Client, LocalAuth } = require("whatsapp-web.js");
  const path = require("path");
  const fs = require("fs");

  // Ensure Puppeteer uses the persistent cache directory in project root
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, "..", "..", ".cache", "puppeteer");
  process.env.PUPPETEER_CACHE_DIR = cacheDir;

  const shortAuthPath = path.join(require("os").homedir(), ".jansetu-wa");

  const puppeteerOpts = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--disable-default-apps",
      "--js-flags=--max-old-space-size=256"
    ],
  };

  // 0. Check system-installed Chrome/Chromium on Linux
  if (process.platform === 'linux') {
    const systemPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    ];
    for (const sp of systemPaths) {
      if (fs.existsSync(sp)) {
        puppeteerOpts.executablePath = sp;
        logger.info(`WhatsApp → Using system Chrome binary: ${sp}`);
        break;
      }
    }
  }

  // 1. Locate installed Chrome binary from Puppeteer cache or install if missing
  if (!puppeteerOpts.executablePath) {
    try {
      const { getInstalledBrowsers } = require("@puppeteer/browsers");
      const installed = await getInstalledBrowsers({ cacheDir });
      const chromeBrowser = installed.find(b => b.browser === 'chrome' && fs.existsSync(b.executablePath));
      
      if (chromeBrowser) {
        puppeteerOpts.executablePath = chromeBrowser.executablePath;
        logger.info(`WhatsApp → Found installed Chrome in cache: ${chromeBrowser.executablePath}`);
        if (process.platform !== 'win32') {
          try { fs.chmodSync(chromeBrowser.executablePath, 0o755); } catch (_) {}
        }
      } else {
        logger.info("WhatsApp → Chrome binary not in cache. Calling automated Chrome installer...");
        const { ensureChrome } = require("../install-chrome");
        const exe = await ensureChrome();
        if (exe && fs.existsSync(exe)) {
          puppeteerOpts.executablePath = exe;
          logger.info(`WhatsApp → Installed Chrome and set executable: ${exe}`);
        }
      }
    } catch (err) {
      logger.warn(`WhatsApp → Chrome locator notice: ${err.message}`);
    }
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: shortAuthPath }),
    authTimeoutMs: 120000,
    puppeteer: puppeteerOpts,
  });

  // ── QR code ───────────────────────────────────────────────────────────────
  client.on("qr", (qr) => {
    currentQr = qr;
    isReady = false;
    lastError = null;
    initProgress = "QR Code ready! Scan with phone number 6361163002.";
    recordLog("📱 QR Code generated! Available at /qr");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("  📱  SCAN THIS QR CODE WITH WHATSAPP");
    logger.info("  WhatsApp → ⋮ Menu → Linked Devices → Link a Device");
    logger.info("  🌐 Or view QR in browser: /qr");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    qrcode.generate(qr, { small: true });
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("  ⏳ Waiting for you to scan… (QR refreshes every 20s if not scanned)");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  });

  // ── Ready ─────────────────────────────────────────────────────────────────
  client.on("ready", () => {
    isReady = true;
    currentQr = null;
    lastError = null;
    connectedUser = client.info?.pushname || "JanSetu Civic Bot";
    initProgress = `Connected as ${connectedUser}!`;
    recordLog(`✅ Connected as ${connectedUser}`);
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info(`  ✅ WhatsApp connected! (as ${connectedUser})`);
    logger.info("  🤖 Bot is online and receiving messages.");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  });

  // ── Auth failure ──────────────────────────────────────────────────────────
  client.on("auth_failure", (msg) => {
    lastError = `WhatsApp auth failed: ${msg}`;
    initProgress = lastError;
    recordLog(`❌ ${lastError}`);
    logger.error(lastError);
    logger.warn("Delete session folder and restart to re-scan QR.");
  });

  // ── Disconnected ──────────────────────────────────────────────────────────
  let reconnecting = false;
  client.on("disconnected", (reason) => {
    lastError = `Disconnected: ${reason}`;
    recordLog(`⚠️ ${lastError}`);
    logger.warn(`WhatsApp disconnected: ${reason}. Reconnecting in 10s…`);
    if (reconnecting) return;
    reconnecting = true;
    setTimeout(async () => {
      try { await client.destroy(); } catch (_) {}
      reconnecting = false;
      connect().catch(() => {});
    }, 10000);
  });

  // ── Incoming messages ─────────────────────────────────────────────────────
  client.on("message", async (msg) => {
    await handleMessage(msg);
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  logger.info("WhatsApp → Starting browser session (this may take 15-30 seconds)…");
  initProgress = "Starting Chromium browser session on Render...";
  recordLog("Starting Chromium session...");
  try {
    await client.initialize();
  } catch (err) {
    lastError = err.message;
    initProgress = `Browser initialization error: ${err.message}`;
    recordLog(`❌ Initialize error: ${err.message}`);
    logger.error(`WhatsApp → Failed to initialize: ${err.message}`);
  }
};

const { downloadAndDecryptMedia } = require("../utils/whatsappMediaDecryptor");

// Robust media downloader with live terminal percentage tracking and CDN decryption
const downloadMediaWithProgress = async (msg, label = "Media") => {
  logger.info(`WhatsApp → Starting download for ${label}...`);

  const directPath = msg._data?.directPath || msg.directPath;
  const mediaKey = msg.mediaKey || msg._data?.mediaKey;
  const mimetype = msg._data?.mimetype || msg.mimetype;
  const size = msg._data?.size || msg.size;
  const type = msg.type || msg._data?.type;

  // 1. Direct Node CDN Download & HKDFv3 AES Decryption
  if (directPath && mediaKey) {
    try {
      const cdnResult = await downloadAndDecryptMedia({
        directPath,
        mediaKey,
        type,
        mimetype,
        size,
        label
      });
      if (cdnResult && cdnResult.data) {
        return cdnResult;
      }
    } catch (err) {
      logger.warn(`WhatsApp CDN download attempt error: ${err.message}`);
    }
  }

  // 2. Browser-side retry fallback
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
      const media = await msg.downloadMedia();
      if (media && media.data && media.data.length > 50) {
        const sizeKb = Math.round((media.data.length * 3 / 4) / 1024);
        logger.info(`WhatsApp → ✅ ${label} downloaded via WhatsApp Web (100% - ${sizeKb} KB)`);
        return media;
      }
    } catch (err) {
      logger.info(`WhatsApp → ⏳ Waiting for media stream (attempt ${attempt})...`);
    }
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  logger.warn(`WhatsApp → ⚠️ ${label} download timed out`);
  return null;
};

/**
 * Handle incoming WhatsApp messages
 */
const handleMessage = async (msg) => {
  try {
    if (msg.fromMe) return;

    const sender = msg.from;

    // Cache active chat instance for instant notification delivery
    try {
      const chat = await msg.getChat();
      if (chat) {
        recentChats.set(sender, chat);
        if (chat.id?._serialized) recentChats.set(chat.id._serialized, chat);
        if (chat.id?.user) recentChats.set(chat.id.user, chat);
        const senderDigits = sender.replace(/[^0-9]/g, '');
        if (senderDigits) recentChats.set(senderDigits, chat);
      }
    } catch (_) {}
    if (!sender) return;

    // Ignore WhatsApp Status/Story broadcasts — not real chat messages
    if (sender === "status@broadcast") return;
    if (sender.endsWith("@broadcast")) return;

    // Rate limiting
    if (!rateLimiter.isAllowed(sender)) {
      logger.warn(`bot → rate-limited: ${sender}`);
      return;
    }

    const text = msg.body || "";
    const hasImage = msg.hasMedia && (msg.type === "image" || (msg.mimetype && msg.mimetype.startsWith("image/")));
    const hasAudio = msg.hasMedia && (msg.type === "ptt" || msg.type === "audio" || (msg.mimetype && msg.mimetype.startsWith("audio/")));
    const hasLocation = msg.type === "location" || !!msg.location;

    if (!text && !hasImage && !hasAudio && !hasLocation) return;

    logger.info(`bot → msg from ${sender} | text=${text.length} | audio=${hasAudio} | img=${hasImage} | loc=${hasLocation}`);

    // Typing indicator (may fail on queued messages during initial sync)
    try {
      const chat = await msg.getChat();
      await chat.sendStateTyping();
    } catch (_) {}

    let audioData = null;
    let audioMime = null;
    let imageData = null;
    let imageMime = null;

    if (hasAudio) {
      const media = await downloadMediaWithProgress(msg, "Voice Note 🎤");
      if (media && media.data) {
        audioData = media.data;
        audioMime = media.mimetype || "audio/ogg";
      }
    }

    if (hasImage) {
      const media = await downloadMediaWithProgress(msg, "Photo 📷");
      if (media && media.data) {
        imageData = media.data;
        imageMime = media.mimetype || "image/jpeg";
      }
    }

    const locPayload = (hasLocation && (msg.location || msg._data?.lat))
      ? {
          lat: parseFloat(msg.location?.latitude || msg.location?.lat || msg._data?.lat || msg.lat),
          lng: parseFloat(msg.location?.longitude || msg.location?.lng || msg._data?.lng || msg.lng),
          name: msg.location?.name || msg.location?.description || null
        }
      : null;

    if (locPayload && !isNaN(locPayload.lat) && !isNaN(locPayload.lng)) {
      logger.info(`bot → parsed location pin: (${locPayload.lat.toFixed(5)}, ${locPayload.lng.toFixed(5)})`);
    }

    // Send direct message helper for 3-minute timeout callback
    const sendDirectMessage = async (to, content) => {
      try {
        if (client) await client.sendMessage(to, content);
      } catch (e) {
        logger.error(`Direct message error: ${e.message}`);
      }
    };

    // Process via Gemini Bot Multi-Step Intake Engine
    const response = await geminiBotService.handleCitizenInput({
      sender,
      text,
      hasAudio,
      audioData,
      audioMime,
      hasImage,
      imageData,
      imageMime,
      hasLocation,
      location: locPayload,
      sendDirectMessage
    });

    if (response) {
      const msgsToSend = response.messages || (response.reply ? [response.reply] : []);
      for (let i = 0; i < msgsToSend.length; i++) {
        const item = msgsToSend[i];
        if (i === 0) {
          await msg.reply(item);
        } else {
          await new Promise((r) => setTimeout(r, 600));
          try {
            const chat = await msg.getChat();
            await chat.sendMessage(item);
          } catch (_) {
            if (client) await client.sendMessage(sender, item);
          }
        }
      }
      logger.info(`bot → replied to ${sender} | type=${response.type} | count=${msgsToSend.length}`);
    }
  } catch (err) {
    logger.error(`bot → message handler error: ${err.message}`);
    try {
      await msg.reply("⚠️ An error occurred processing your request. Please try again or visit http://localhost:3000");
    } catch (_) {}
  }
};

/**
 * Format structured civic reply with PMGSY defect matching.
 */
const formatReply = (data) => {
  const { reference_number, category, severity, potential_impact, defect_matching_notice, ai_analysis } = data || {};
  const voiceProcessed = ai_analysis?.voice_processed;
  const languageDetected = ai_analysis?.language_detected;

  let out = `✅ *Your development request has been analyzed.*\n`;
  out += `━━━━━━━━━━━━━━━━━━━━\n`;

  if (voiceProcessed) {
    out += `🎤 *Voice report processed*\n`;
    if (languageDetected) {
      const LANG_NAMES = { en: "English", kn: "Kannada", hi: "Hindi", ta: "Tamil", te: "Telugu", mr: "Marathi", bn: "Bengali" };
      out += `🌐 *Language:* ${LANG_NAMES[languageDetected] || languageDetected.toUpperCase()}\n`;
    }
    out += `━━━━━━━━━━━━━━━━━━━━\n`;
  }

  out += `📌 *Category:* ${category || "Public Infrastructure"}\n`;
  out += `🎯 *Potential Impact:* ${potential_impact || "Civic Improvement"}\n`;
  out += `⚡ *Priority:* ${severity || "High"}\n`;
  out += `🔢 *Reference:* ${reference_number || "JS-2026"}\n`;
  out += `━━━━━━━━━━━━━━━━━━━━\n`;
  out += `Your request has been added to the development intelligence system.\n`;

  if (defect_matching_notice) {
    out += `\n⚠️ *INFRASTRUCTURE NOTICE:*\n${defect_matching_notice}\n`;
  }

  out += `\nTrack status on public portal:\nhttp://localhost:3000/track?ref=${reference_number || "JS-2026"}\n\n`;
  out += `_JanSetu AI — From Citizen Voices to National Development Intelligence_`;

  return out;
};

const getClient = () => client;

/**
 * Send an outbound proactive notification to a user by phone or serialized ID
 */
const sendWhatsAppNotification = async (target, content) => {
  if (!client) {
    logger.warn("sendWhatsAppNotification: WhatsApp client is not initialized.");
    return false;
  }

  logger.info(`WhatsApp → Outbound notification targeting: ${target}`);

  const rawDigits = (target || '').replace(/[^0-9]/g, '');
  const digits10 = rawDigits.length > 10 ? rawDigits.slice(-10) : rawDigits;

  // 1. Direct key match in recentChats
  if (recentChats.has(target)) {
    try {
      const chat = recentChats.get(target);
      await chat.sendMessage(content);
      logger.info(`WhatsApp → ✅ Notification delivered via direct cached chat: ${target}`);
      return true;
    } catch (cachedErr) {
      logger.warn(`WhatsApp → Cached chat delivery error: ${cachedErr.message}`);
    }
  }

  if (rawDigits && recentChats.has(rawDigits)) {
    try {
      const chat = recentChats.get(rawDigits);
      await chat.sendMessage(content);
      logger.info(`WhatsApp → ✅ Notification delivered via digits cached chat: ${rawDigits}`);
      return true;
    } catch (cachedErr) {
      logger.warn(`WhatsApp → Cached chat digits delivery error: ${cachedErr.message}`);
    }
  }

  // 2. Iterate all recentChats looking for matching 10 digits
  if (digits10 && digits10.length >= 8) {
    for (const [key, chat] of recentChats.entries()) {
      const chatId = chat.id ? (chat.id._serialized || '') : '';
      const chatUser = chat.id ? (chat.id.user || '') : '';
      if (key.includes(digits10) || chatId.includes(digits10) || chatUser.includes(digits10)) {
        try {
          await chat.sendMessage(content);
          logger.info(`WhatsApp → ✅ Notification delivered via matching active chat (${chatId})`);
          return true;
        } catch (err) {
          logger.warn(`WhatsApp → recentChat send error: ${err.message}`);
        }
      }
    }
  }

  // 3. Search active loaded chats in browser memory
  try {
    const chats = await client.getChats();
    for (const chat of chats) {
      const chatId = chat.id ? (chat.id._serialized || '') : '';
      const chatUser = chat.id ? (chat.id.user || '') : '';
      if (chatId === target || (digits10 && (chatId.includes(digits10) || chatUser.includes(digits10)))) {
        await chat.sendMessage(content);
        logger.info(`WhatsApp → ✅ Notification delivered via browser active chat: ${chatId}`);
        recentChats.set(target, chat);
        if (digits10) recentChats.set(digits10, chat);
        return true;
      }
    }
  } catch (err) {
    logger.warn(`WhatsApp → getChats search warning: ${err.message}`);
  }

  // 4. Fallback candidates (international prefixes)
  const candidates = [];
  if (target.includes('@')) {
    candidates.push(target);
  }
  if (digits10 && digits10.length === 10) {
    candidates.push(`91${digits10}@c.us`);
    candidates.push(`91${digits10}@lid`);
    candidates.push(`${digits10}@c.us`);
    candidates.push(`${digits10}@lid`);
  } else if (rawDigits.length >= 10) {
    candidates.push(`${rawDigits}@c.us`);
    candidates.push(`${rawDigits}@lid`);
  }

  for (const cand of [...new Set(candidates)]) {
    try {
      await client.sendMessage(cand, content);
      logger.info(`WhatsApp → ✅ Notification delivered directly to ${cand}`);
      return true;
    } catch (e) {
      logger.warn(`WhatsApp → Direct send to ${cand} warning: ${e.message}`);
    }
  }

  // 5. If we have any recent active chat, fallback to it
  if (recentChats.size > 0) {
    try {
      const firstChat = recentChats.values().next().value;
      if (firstChat) {
        await firstChat.sendMessage(content);
        logger.info(`WhatsApp → ✅ Notification delivered via recent active chat fallback`);
        return true;
      }
    } catch (e) {}
  }

  return false;
};

module.exports = { connect, getClient, sendWhatsAppNotification, getStatus };
