const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const rateLimiter = require('../utils/rateLimiter');
const { geminiBotService } = require('../services/geminiBotService');

let sock = null;
let currentQr = null;
let isReady = false;
let connectedUser = null;
let lastError = null;
let initProgress = 'Bot initializing...';
const recentLogs = [];
const recentChats = new Map();

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

const getClient = () => sock;

const connect = async () => {
  try {
    initProgress = '1/4: Loading auth credentials...';
    recordLog('Loading auth credentials...');
    
    const authDir = path.join(__dirname, '..', '.wwebjs_auth');
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    initProgress = '2/4: Connecting to WhatsApp servers...';
    recordLog('Connecting to WhatsApp servers...');

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['JanSetu AI', 'Chrome', '122.0.0'],
      logger: pino({ level: 'silent' }),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 25000,
      markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        currentQr = qr;
        isReady = false;
        lastError = null;
        initProgress = '4/4: QR Code ready! Scan with phone number 6361163002.';
        recordLog('📱 QR Code generated! Available at /qr');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.info('  📱  SCAN THIS QR CODE WITH WHATSAPP');
        logger.info('  WhatsApp → ⋮ Menu → Linked Devices → Link a Device');
        logger.info('  🌐 Or view QR in browser: /qr');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        isReady = true;
        currentQr = null;
        lastError = null;
        connectedUser = sock.user?.name || sock.user?.verifiedName || 'JanSetu Civic Bot';
        initProgress = `Connected as ${connectedUser}!`;
        recordLog(`✅ Connected as ${connectedUser}`);
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.info(`  ✅ WhatsApp connected! (as ${connectedUser})`);
        logger.info('  🤖 Bot is online and receiving messages.');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
          : true;

        if (shouldReconnect) {
          lastError = `Disconnected. Reconnecting...`;
          recordLog(`⚠️ ${lastError}`);
          logger.warn(`WhatsApp disconnected. Reconnecting in 5s...`);
          setTimeout(() => {
            connect().catch(() => {});
          }, 5000);
        } else {
          lastError = 'Logged out. Delete auth folder and restart.';
          initProgress = lastError;
          recordLog(`❌ ${lastError}`);
          logger.error(lastError);
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (!msg.key.fromMe) {
            await handleMessage(msg);
          }
        }
      }
    });

  } catch (err) {
    lastError = err.message;
    initProgress = `Initialization error: ${err.message}`;
    recordLog(`❌ Initialize error: ${err.message}`);
    logger.error(`WhatsApp → Failed to initialize: ${err.message}`);
  }
};

const downloadMediaWithProgress = async (msg, label = 'Media') => {
  logger.info(`WhatsApp → Starting download for ${label}...`);
  try {
    const buffer = await downloadMediaMessage(
      msg, 'buffer', {},
      { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
    );
    if (buffer && buffer.length > 50) {
      const sizeKb = Math.round(buffer.length / 1024);
      logger.info(`WhatsApp → ✅ ${label} downloaded (${sizeKb} KB)`);
      return {
        data: buffer.toString('base64'),
        mimetype: msg.message?.audioMessage?.mimetype || msg.message?.imageMessage?.mimetype || 'application/octet-stream'
      };
    }
  } catch (err) {
    logger.warn(`WhatsApp → ${label} download error: ${err.message}`);
  }
  return null;
};

const handleMessage = async (msg) => {
  try {
    const sender = msg.key.remoteJid;
    if (!sender) return;

    if (sender === 'status@broadcast' || sender.endsWith('@broadcast')) return;

    if (!rateLimiter.isAllowed(sender)) {
      logger.warn(`bot → rate-limited: ${sender}`);
      return;
    }

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const hasImage = !!msg.message?.imageMessage;
    const hasAudio = !!msg.message?.audioMessage;
    const hasLocation = !!msg.message?.locationMessage;

    if (!text && !hasImage && !hasAudio && !hasLocation) return;

    logger.info(`bot → msg from ${sender} | text=${text.length} | audio=${hasAudio} | img=${hasImage} | loc=${hasLocation}`);

    recentChats.set(sender, { lastSeen: Date.now() });

    try {
      await sock.presenceSubscribe(sender);
      await sock.sendPresenceUpdate('composing', sender);
    } catch (_) {}

    let audioData = null;
    let audioMime = null;
    let imageData = null;
    let imageMime = null;

    if (hasAudio) {
      const media = await downloadMediaWithProgress(msg, 'Voice Note 🎤');
      if (media && media.data) {
        audioData = media.data;
        audioMime = media.mimetype;
      }
    }

    if (hasImage) {
      const media = await downloadMediaWithProgress(msg, 'Photo 📷');
      if (media && media.data) {
        imageData = media.data;
        imageMime = media.mimetype;
      }
    }

    const locMsg = msg.message?.locationMessage;
    const locPayload = hasLocation && locMsg
      ? {
          lat: locMsg.degreesLatitude,
          lng: locMsg.degreesLongitude,
          name: locMsg.name || locMsg.address || null
        }
      : null;

    if (locPayload && !isNaN(locPayload.lat) && !isNaN(locPayload.lng)) {
      logger.info(`bot → parsed location pin: (${locPayload.lat.toFixed(5)}, ${locPayload.lng.toFixed(5)})`);
    }

    const sendDirectMessage = async (to, content) => {
      try {
        if (sock) await sock.sendMessage(to, { text: content });
      } catch (e) {
        logger.error(`Direct message error: ${e.message}`);
      }
    };

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
          await sock.sendMessage(sender, { text: item }, { quoted: msg });
        } else {
          await new Promise((r) => setTimeout(r, 600));
          await sock.sendMessage(sender, { text: item });
        }
      }
      logger.info(`bot → replied to ${sender} | type=${response.type} | count=${msgsToSend.length}`);
    }
  } catch (err) {
    logger.error(`bot → message handler error: ${err.message}`);
    try {
      const errUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 10000}`;
      await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ An error occurred processing your request. Please try again or visit ${errUrl}` });
    } catch (_) {}
  }
};

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

  const TRACK_URL = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_WEB_URL || `http://localhost:${process.env.PORT || 10000}`;
  out += `\nTrack status on public portal:\n${TRACK_URL}/track?ref=${reference_number || "JS-2026"}\n\n`;
  out += `_JanSetu AI — From Citizen Voices to National Development Intelligence_`;

  return out;
};

const sendWhatsAppNotification = async (target, content) => {
  if (!sock) return false;
  
  const rawDigits = (target || '').replace(/[^0-9]/g, '');
  const digits10 = rawDigits.length > 10 ? rawDigits.slice(-10) : rawDigits;
  
  const candidates = [];
  if (target.includes('@')) candidates.push(target);
  if (digits10 && digits10.length === 10) {
    candidates.push(`91${digits10}@s.whatsapp.net`);
  } else if (rawDigits.length >= 10) {
    candidates.push(`${rawDigits}@s.whatsapp.net`);
  }
  
  for (const [key] of recentChats.entries()) {
    if (key.includes(digits10)) candidates.push(key);
  }
  
  for (const jid of [...new Set(candidates)]) {
    try {
      await sock.sendMessage(jid, { text: content });
      logger.info(`WhatsApp → ✅ Notification delivered to ${jid}`);
      return true;
    } catch (e) {
      logger.warn(`WhatsApp → Send to ${jid} failed: ${e.message}`);
    }
  }
  
  return false;
};

module.exports = { connect, getClient, sendWhatsAppNotification, getStatus };
