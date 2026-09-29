/**
 * routes/news.js
 * REST API endpoints exposed by the WhatsApp bot server.
 *
 * GET  /health        — health check
 * POST /check-news    — manually analyse a piece of text/URL
 * POST /alert-authority — internal endpoint to log an authority alert
 */

const express         = require("express");
const rateLimit       = require("express-rate-limit");
const router          = express.Router();
const fakeNewsService = require("../services/fakeNewsService");
const alertService    = require("../services/alertService");
const logger          = require("../utils/logger");
const { getSocket }   = require("../bot/whatsapp");

// Rate limit REST API: 30 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max:      30,
  message:  { error: "Too many requests. Please slow down." },
});

/* ── GET /health ──────────────────────────────────────────────────────────── */
router.get("/health", (_req, res) => {
  const socket     = getSocket();
  const waStatus   = socket?.user ? "connected" : "disconnected";

  res.json({
    status:      "ok",
    service:     "Sentinel WhatsApp Bot",
    whatsapp:    waStatus,
    connectedAs: socket?.user?.id || null,
    timestamp:   new Date().toISOString(),
  });
});

/* ── POST /check-news ─────────────────────────────────────────────────────── */
// Manually analyse text or a URL (useful for testing without WhatsApp)
router.post("/check-news", apiLimiter, async (req, res) => {
  try {
    const { text, url } = req.body;
    const content = text || url;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ error: "'text' or 'url' field is required" });
    }

    const msgType  = url ? "url" : "text";
    const analysis = await fakeNewsService.analyse(content.trim(), msgType);

    logger.info(`/check-news → ${analysis.status} (${analysis.confidence}%)`);

    res.json({
      success: true,
      input:   content.slice(0, 100),
      ...analysis,
    });
  } catch (err) {
    logger.error(`/check-news error: ${err.message}`);
    res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
});

/* ── POST /alert-authority ────────────────────────────────────────────────── */
// Internal endpoint called when confidence exceeds the threshold
router.post("/alert-authority", apiLimiter, async (req, res) => {
  try {
    const { content, sender, timestamp, confidence, reason } = req.body;

    if (!content || !sender) {
      return res.status(400).json({ error: "'content' and 'sender' are required" });
    }

    logger.warn(`/alert-authority → high-confidence fake news from ${sender} (${confidence}%)`);

    // Forward to Sentinel backend complaint system
    await alertService.alertAuthority({
      content,
      sender,
      analysis: { confidence, reason, crimeType: "FakeNews", severity: "HIGH" },
    });

    res.json({
      success:   true,
      message:   "Authority has been alerted",
      sender,
      timestamp: timestamp || new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`/alert-authority error: ${err.message}`);
    res.status(500).json({ error: "Alert failed", detail: err.message });
  }
});

/* ── POST /notify-status ─────────────────────────────────────────────────── */
// Real-time status update webhook called when authority changes ticket status
router.post("/notify-status", async (req, res) => {
  try {
    const {
      reference_number,
      phone_number,
      category,
      status,
      officer_name,
      officer_role,
      notes,
      language,
      location,
      ai_summary_en,
      ai_summary_kn,
      ai_summary_hi,
      citizen_advice
    } = req.body;

    logger.info(`Status update notification received: Ref=${reference_number}, Status=${status}, To=${phone_number}`);

    if (!phone_number) {
      return res.status(400).json({ error: "phone_number is required" });
    }

    const { getClient } = require("../bot/whatsapp");
    const client = getClient();
    if (!client) {
      return res.status(503).json({ error: "WhatsApp client not online" });
    }

    const isKn = language === "kn";
    const isHi = language === "hi";

    const statusLabels = {
      UNDER_REVIEW: { en: "🟡 UNDER REVIEW", kn: "🟡 ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ (UNDER REVIEW)", hi: "🟡 समीक्षाधीन (UNDER REVIEW)" },
      ASSIGNED: { en: "🔵 ASSIGNED TO ENGINEER", kn: "🔵 ಇಂಜಿನಿಯರ್‌ಗೆ ನಿಯೋಜಿಸಲಾಗಿದೆ (ASSIGNED)", hi: "🔵 इंजीनियर को सौंपा गया (ASSIGNED)" },
      ACTION_TAKEN: { en: "🟠 WORK IN PROGRESS", kn: "🟠 ದುರಸ್ತಿ ಕಾರ್ಯ ಪ್ರಗತಿಯಲ್ಲಿದೆ (WORK IN PROGRESS)", hi: "🟠 कार्य प्रगति पर है (IN PROGRESS)" },
      VERIFIED: { en: "🟢 FIELD VERIFIED", kn: "🟢 ಸ್ಥಳ ಪರಿಶೀಲನೆ ಪೂರ್ಣಗೊಂಡಿದೆ (VERIFIED)", hi: "🟢 फील्ड सत्यापित (VERIFIED)" },
      RESOLVED: { en: "✅ RESOLVED", kn: "✅ ಸಮಸ್ಯೆ ಪರಿಹರಿಸಲಾಗಿದೆ (RESOLVED)", hi: "✅ समस्या हल हो गई (RESOLVED)" },
      REJECTED: { en: "❌ CLOSED / REJECTED", kn: "❌ ಮುಕ್ತಾಯ / ತಿರಸ್ಕರಿಸಲಾಗಿದೆ (CLOSED)", hi: "❌ बंद / अस्वीकृत (CLOSED)" }
    };

    const statusObj = statusLabels[status] || { en: status, kn: status, hi: status };
    const statusText = isKn ? statusObj.kn : (isHi ? statusObj.hi : statusObj.en);

    let msgText = "";
    if (isKn) {
      msgText = `📢 *ದೂರು ಸ್ಥಿತಿ ನವೀಕರಣ (Status Update)*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔢 *ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ (Ref):* ${reference_number}\n` +
        `📌 *ವರ್ಗ:* ${category || 'ಸಾರ್ವಜನಿಕ ಸಮಸ್ಯೆ'}\n` +
        (location ? `📍 *ಸ್ಥಳ:* ${location}\n` : '') +
        `⚡ *ಹೊಸ ಸ್ಥಿತಿ:* ${statusText}\n` +
        `👤 *ಅಧಿಕಾರಿ:* ${officer_name || 'ಅಧಿಕೃತ ಇಂಜಿನಿಯರ್'} (${officer_role || 'ಸರ್ಕಾರಿ ಅಧಿಕಾರಿ'})\n` +
        (notes ? `📝 *ಅಧಿಕಾರಿಯ ಟಿಪ್ಪಣಿ:* "${notes}"\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        (ai_summary_kn ? `🤖 *AI ವಿಶ್ಲೇಷಣೆ & ವಿವರಣೆ:*\n${ai_summary_kn}\n\n` : '') +
        (citizen_advice ? `💡 *ನಾಗರಿಕ ಮಾಹಿತಿ:* ${citizen_advice}\n\n` : '') +
        `ಲೈವ್ ಪ್ರಗತಿ ಪರಿಶೀಲಿಸಿ:\nhttp://localhost:3000/track?ref=${reference_number}\n\n` +
        `_ಜನಸೇತು AI — ನಾಗರಿಕ ಸೇವಾ ವೇದಿಕೆ_`;
    } else if (isHi) {
      msgText = `📢 *शिकायत स्थिति अपडेट (Status Update)*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔢 *संदर्भ संख्या:* ${reference_number}\n` +
        `📌 *श्रेणी:* ${category || 'सार्वजनिक समस्या'}\n` +
        (location ? `📍 *स्थान:* ${location}\n` : '') +
        `⚡ *नई स्थिति:* ${statusText}\n` +
        `👤 *अधिकारी:* ${officer_name || 'प्राधिकृत अधिकारी'} (${officer_role || 'विभागीय अधिकारी'})\n` +
        (notes ? `📝 *अधिकारी की टिप्पणी:* "${notes}"\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        (ai_summary_hi ? `🤖 *AI विश्लेषण और स्पष्टीकरण:*\n${ai_summary_hi}\n\n` : '') +
        (citizen_advice ? `💡 *नागरिक सूचना:* ${citizen_advice}\n\n` : '') +
        `लाइव स्थिति जांचें:\nhttp://localhost:3000/track?ref=${reference_number}\n\n` +
        `_जनसेतु AI — नागरिक सेवा मंच_`;
    } else {
      msgText = `📢 *COMPLAINT STATUS UPDATE*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔢 *Ticket Reference:* ${reference_number}\n` +
        `📌 *Category:* ${category || 'Civic Infrastructure'}\n` +
        (location ? `📍 *Location:* ${location}\n` : '') +
        `⚡ *Current Status:* ${statusText}\n` +
        `👤 *Updated By:* ${officer_name || 'Authorized Officer'} (${officer_role || 'Department Engineer'})\n` +
        (notes ? `📝 *Officer Notes:* "${notes}"\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        (ai_summary_en ? `🤖 *AI Action Analysis:*\n${ai_summary_en}\n\n` : '') +
        (citizen_advice ? `💡 *Citizen Advisory:* ${citizen_advice}\n\n` : '') +
        `Track live progress on public portal:\nhttp://localhost:3000/track?ref=${reference_number}\n\n` +
        `_JanSetu AI — Citizen Intelligence System_`;
    }

    const { sendWhatsAppNotification } = require("../bot/whatsapp");
    const delivered = await sendWhatsAppNotification(phone_number, msgText);

    return res.json({
      success: true,
      delivered,
      message: delivered ? "Status update notification delivered to citizen." : "Queued/attempted delivery."
    });
  } catch (err) {
    logger.error(`/notify-status error: ${err.message}`);
    return res.status(500).json({ error: "Failed to send status update notification", detail: err.message });
  }
});

/**
 * POST /notify-registered
 * Send instant registration confirmation receipt to citizen on WhatsApp
 */
router.post("/notify-registered", async (req, res) => {
  try {
    const { reference_number, phone_number, category, location, language, summary } = req.body;
    logger.info(`Complaint registered notification received: Ref=${reference_number}, Phone=${phone_number}`);

    if (!phone_number) {
      return res.status(400).json({ error: "phone_number is required" });
    }

    const { getClient } = require("../bot/whatsapp");
    const client = getClient();
    if (!client) {
      return res.status(503).json({ error: "WhatsApp client not online" });
    }

    const isKn = language === "kn";
    const isHi = language === "hi";

    let msgText = "";
    if (isKn) {
      msgText = `🎉 *ದೂರು ಅಧಿಕೃತವಾಗಿ ನೋಂದಾಯಿಸಲಾಗಿದೆ! (Complaint Registered)*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔢 *ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ (Ref):* ${reference_number}\n` +
        `📌 *ವರ್ಗ:* ${category || 'ಸಾರ್ವಜನಿಕ ಸಮಸ್ಯೆ'}\n` +
        (location ? `📍 *ಸ್ಥಳ:* ${location}\n` : '') +
        (summary ? `📝 *ವಿವರ:* ${summary}\n` : '') +
        `⚡ *ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ:* 🟡 ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ (UNDER REVIEW)\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `ನಿಮ್ಮ ದೂರನ್ನು ಸಂಬಂಧಪಟ್ಟ ಸ್ಥಳೀಯ ಇಂಜಿನಿಯರಿಂಗ್ ಇಲಾಖೆಗೆ ರವಾನಿಸಲಾಗಿದೆ.\n` +
        `ಅಧಿಕಾರಿಗಳು ಕ್ರಮ ಕೈಗೊಂಡಾಗ ನಿಮಗೆ ವಾಟ್ಸಾಪ್ ಮೂಲಕ ನೇರ ಅಪ್ಡೇಟ್ ತಲುಪಲಿದೆ.\n\n` +
        `ಲೈವ್ ಪ್ರಗತಿ ಪರಿಶೀಲಿಸಿ:\n` +
        `http://localhost:3000/track?ref=${reference_number}\n\n` +
        `_ಜನಸೇತು AI — ನಾಗರಿಕ ಸೇವಾ ವೇದಿಕೆ_`;
    } else if (isHi) {
      msgText = `🎉 *शिकायत आधिकारिक रूप से दर्ज! (Complaint Registered)*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔢 *संदर्भ संख्या (Ref):* ${reference_number}\n` +
        `📌 *श्रेणी:* ${category || 'सार्वजनिक समस्या'}\n` +
        (location ? `📍 *स्थान:* ${location}\n` : '') +
        (summary ? `📝 *विवरण:* ${summary}\n` : '') +
        `⚡ *वर्तमान स्थिति:* 🟡 समीक्षाधीन (UNDER REVIEW)\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `आपकी शिकायत संबंधित विभाग को भेज दी गई है।\n` +
        `अधिकारी द्वारा की गई कार्रवाई की जानकारी आपको सीधे व्हाट्सएप पर मिलेगी।\n\n` +
        `लाइव स्थिति जांचें:\n` +
        `http://localhost:3000/track?ref=${reference_number}\n\n` +
        `_जनसेतु AI — नागरिक सेवा मंच_`;
    } else {
      msgText = `🎉 *COMPLAINT OFFICIALLY REGISTERED!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔢 *Ticket Reference:* ${reference_number}\n` +
        `📌 *Category:* ${category || 'Civic Infrastructure'}\n` +
        (location ? `📍 *Location:* ${location}\n` : '') +
        (summary ? `📝 *Summary:* ${summary}\n` : '') +
        `⚡ *Current Status:* 🟡 UNDER REVIEW\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Your complaint has been routed to the concerned engineering department.\n` +
        `You will receive live WhatsApp updates as official action is taken.\n\n` +
        `Track live progress on public portal:\n` +
        `http://localhost:3000/track?ref=${reference_number}\n\n` +
        `_JanSetu AI — Citizen Intelligence System_`;
    }

    const { sendWhatsAppNotification } = require("../bot/whatsapp");
    const delivered = await sendWhatsAppNotification(phone_number, msgText);

    return res.json({
      success: true,
      delivered,
      message: delivered ? "Registration receipt sent to citizen via WhatsApp." : "Queued delivery."
    });
  } catch (err) {
    logger.error(`/notify-registered error: ${err.message}`);
    return res.status(500).json({ error: "Failed to send registration notification", detail: err.message });
  }
});

/**
 * POST /send-otp
 * Send 6-digit OTP verification message to citizen's WhatsApp
 */
router.post("/send-otp", async (req, res) => {
  try {
    const { phone_number, otp, purpose } = req.body;
    logger.info(`WhatsApp OTP request: Phone=${phone_number}, Purpose=${purpose}`);

    if (!phone_number || !otp) {
      return res.status(400).json({ error: "phone_number and otp are required" });
    }

    const isLogin = purpose === "LOGIN";
    const headerKn = isLogin ? "🔐 ಲಾಗಿನ್ ಪರಿಶೀಲನಾ ಕೋಡ್ (Login OTP)" : "🔐 ನೋಂದಣಿ ಪರಿಶೀಲನಾ ಕೋಡ್ (Registration OTP)";
    const headerEn = isLogin ? "🔐 JanSetu Login Verification OTP" : "🔐 JanSetu Citizen Registration OTP";

    const msgText = `*${headerKn}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `ನಿಮ್ಮ 6-ಅಂಕಿಯ ಪರಿಶೀಲನಾ ಕೋಡ್:\n` +
      `👉 *${otp}*\n\n` +
      `*${headerEn}*\n` +
      `Your 6-digit verification code is:\n` +
      `👉 *${otp}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ ಈ ಕೋಡ್ ಮುಂದಿನ 5 ನಿಮಿಷಗಳವರೆಗೆ ಮಾತ್ರ ಮಾನ್ಯವಾಗಿರುತ್ತದೆ.\n` +
      `Valid for 5 minutes. Do not share this code with anyone.\n\n` +
      `_ಜನಸೇತು AI — ಸುರಕ್ಷಿತ ಡಿಜಿಟಲ್ ನಾಗರಿಕ ಸೇವೆ_`;

    const { sendWhatsAppNotification } = require("../bot/whatsapp");
    const delivered = await sendWhatsAppNotification(phone_number, msgText);

    return res.json({
      success: true,
      delivered,
      message: delivered ? "OTP delivered to citizen on WhatsApp." : "Queued OTP delivery."
    });
  } catch (err) {
    logger.error(`/send-otp error: ${err.message}`);
    return res.status(500).json({ error: "Failed to send WhatsApp OTP", detail: err.message });
  }
});

module.exports = router;
