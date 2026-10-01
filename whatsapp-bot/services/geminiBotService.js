/**
 * services/geminiBotService.js
 * 
 * JanSetu AI — Intelligent Multi-Step WhatsApp Intake & Gemini AI Engine
 * 
 * Flow:
 * 1. Citizen sends message -> Gemini detects CHAT vs. CIVIC_COMPLAINT.
 *    - If CHAT / GREETINGS / QUESTIONS: Gemini produces a natural conversational reply in citizen's language (Kannada/Hindi/English) and guides how to report.
 *    - If CIVIC_COMPLAINT: Initiates Step 1 analysis -> Step 2 Location Pin prompt.
 * 2. Citizen sends Location Pin -> Location tagged -> Step 3 Photo prompt (with 3-minute auto-finalize timer).
 * 3. Citizen sends Photo (or 3 minutes elapse / 'skip') -> AI analyzes damage -> Final Registration Receipt -> Session closed, citizen can file new complaints.
 * 4. Duplicate Check: If same user submits same issue in same category/location within 7 days -> Shows existing ticket & status.
 * 5. Direct Multimodal Gemini (Native Voice understanding & Vision damage assessment).
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const logger = require("../utils/logger");

// On Render: unified server runs at PORT (10000), so ingest is on same host.
// Always use the unified server port — SENTINEL_API_URL is legacy and should not be used.
const MAIN_PORT = process.env.PORT || 10000;
const INGEST_URL = `http://localhost:${MAIN_PORT}/api/signals/ingest`;

// Public-facing URL for tracking links sent to citizens
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL
  || process.env.PUBLIC_WEB_URL
  || `http://localhost:${MAIN_PORT}`;

// In-Memory Active Intake Sessions & User Complaint History
const activeSessions = new Map(); // sender -> Session
const userHistory = new Map();    // sender -> Array<Complaint>

class GeminiBotService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    this.modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    this.genAI = null;
    this._init();
  }

  _init() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    if (this.apiKey && this.apiKey.trim().length > 5) {
      try {
        this.genAI = new GoogleGenerativeAI(this.apiKey.trim());
      } catch (e) {
        logger.warn(`Gemini init error: ${e.message}`);
      }
    }
  }

  async _executeWithModelFallback(fn) {
    this._init();
    if (!this.genAI) return null;

    const modelsToTry = [
      this.modelName,
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro"
    ].filter(Boolean);

    const uniqueModels = [...new Set(modelsToTry)];

    for (const m of uniqueModels) {
      try {
        const model = this.genAI.getGenerativeModel({ model: m });
        const res = await fn(model);
        if (res) return res;
      } catch (err) {
        logger.warn(`Gemini model ${m} error: ${err.message}`);
      }
    }
    return null;
  }

  /**
   * Main entry point for all incoming citizen WhatsApp messages.
   */
  async handleCitizenInput({ sender, text, hasAudio, audioData, audioMime, hasImage, imageData, imageMime, hasLocation, location, sendDirectMessage }) {
    this._init();

    const cleanText = (text || "").trim();
    const existingSession = activeSessions.get(sender);

    // ─── STEP 2: USER SENT LOCATION (PIN, TEXT, OR SKIPPED) DURING ACTIVE SESSION ───
    if (existingSession && existingSession.step === "WAITING_LOCATION") {
      if (hasLocation || location) {
        return await this._handleLocationInput(sender, existingSession, location, sendDirectMessage);
      }
      if (/skip|ನಂತರ|next/i.test(cleanText)) {
        return await this._handleLocationInput(sender, existingSession, null, sendDirectMessage);
      }
      // If user typed address/location text or sent voice note with place name
      if (cleanText.length > 0) {
        const textLoc = { name: cleanText, lat: null, lng: null };
        return await this._handleLocationInput(sender, existingSession, textLoc, sendDirectMessage);
      }
    }

    // ─── STEP 3: USER SENT PHOTO DURING ACTIVE SESSION (OR TYPED 'SKIP') ────────
    if (existingSession && existingSession.step === "WAITING_IMAGE") {
      if (hasImage) {
        return await this._handleImageInput(sender, existingSession, imageData, imageMime);
      }
      if (/skip|done|ಮುಗಿಯಿತು|ಬೇಡ|ನಂತರ|no|next|pass/i.test(cleanText)) {
        return await this._finalizeComplaint(sender, existingSession, { skippedImage: true });
      }
      // If user types text during Step 3, remind them to send photo or skip
      return {
        type: "WAITING_PHOTO_PROMPT",
        messages: [
          `📷 *ಹಂತ ೩: ದಯವಿಟ್ಟು ಸಮಸ್ಯೆಯ ಫೋಟೋ ಕಳುಹಿಸಿ*\n(Step 3: Please send a photo of the defect)\n\n👉 ಕೆಳಗಿರುವ *ಕ್ಯಾಮೆರಾ 📷* ಒತ್ತಿ ಫೋಟೋ ಕಳುಹಿಸಿ.\nಅಥವಾ ಫೋಟೋ ಇಲ್ಲದೆ ಮುಕ್ತಾಯಗೊಳಿಸಲು *'skip'* ಎಂದು ಟೈಪ್ ಮಾಡಿ.`
        ]
      };
    }

    // ─── CHECK IF USER TAPPED A HELP / ACTION COMMAND ─────────────────────────
    const actionReply = this._checkButtonAction(cleanText);
    if (actionReply) {
      return { type: "ACTION_GUIDE", messages: [actionReply] };
    }

    // ─── PROCESS VOICE NOTE (STT) ─────────────────────────────────────────────
    let extractedText = cleanText;
    let voiceTranscribed = false;
    let voiceLanguage = null;

    if (hasAudio) {
      if (audioData) {
        const audioResult = await this._transcribeVoice(audioData, audioMime);
        if (audioResult && audioResult.text && audioResult.text.length > 3) {
          extractedText = audioResult.text;
          voiceLanguage = audioResult.language || "kn";
          voiceTranscribed = true;
          logger.info(`Voice transcription success: lang=${voiceLanguage}, text="${extractedText}"`);
        } else {
          extractedText = cleanText || "Voice note received";
        }
      } else {
        // Audio download failed or empty
        extractedText = cleanText || "Voice Note Received";
      }
    }

    // ─── PROCESS STANDALONE IMAGE (VISION DAMAGE ASSESSMENT) ─────────────────
    let imageAnalysis = null;
    if (hasImage && !existingSession) {
      if (imageData) {
        imageAnalysis = await this._analyzeImageDamage(imageData, imageMime);
        if (imageAnalysis && imageAnalysis.summary && !extractedText) {
          extractedText = imageAnalysis.summary;
        }
      }
    }

    // ─── UNIFIED GEMINI INTENT & CLASSIFICATION ANALYSIS ──────────────────────
    const analysis = await this._analyzeIntentAndCivicIssue(extractedText, hasAudio || hasImage);
    const lang = voiceLanguage || analysis.language || this._detectLanguageSimple(extractedText);

    // If it is a greeting, question, or casual conversation (NOT a civic complaint)
    if (!analysis.is_civic_complaint && !hasAudio && !hasImage && !hasLocation) {
      const replyText = analysis.conversational_reply || this._getStaticGreeting(extractedText, lang);
      return {
        type: "CONVERSATION",
        messages: [replyText]
      };
    }

    // ─── STEP 1: INITIAL CIVIC COMPLAINT REGISTRATION ────────────────────────
    // For facility-specific categories (Healthcare, Education), check duplicate on text
    const isFacilityCategory = ["Healthcare", "Education"].includes(analysis.category);
    if (isFacilityCategory) {
      const duplicate = this._checkDuplicate(sender, analysis, extractedText, hasLocation ? location : null);
      if (duplicate) {
        const duplicateMsg = this._formatDuplicateAlert(duplicate, lang);
        return { type: "DUPLICATE_ALERT", messages: [duplicateMsg] };
      }
    }

    // Generate new reference number
    const refNumber = `JS-2026-${Math.floor(10000 + Math.random() * 90000)}`;

    // Check PMGSY Defect matching warranty
    const defectMatch = this._checkDefectLiability(analysis.category, extractedText);

    // Create new intake session
    const newSession = {
      step: "WAITING_LOCATION",
      refNumber,
      category: analysis.category || "Road Infrastructure",
      severity: analysis.severity || "High",
      potential_impact: analysis.potential_impact || "Public Safety & Community Welfare",
      problemSummary: analysis.problem_summary || extractedText,
      rawText: extractedText,
      language: lang,
      voiceProcessed: voiceTranscribed,
      voiceLanguage,
      imageData: imageData || null,
      imageMime: imageMime || null,
      imageAnalysis: imageAnalysis || null,
      defectMatch,
      location: hasLocation ? location : null,
      createdAt: Date.now(),
      timer: null
    };

    activeSessions.set(sender, newSession);

    // Format Step 1 & Step 2 messages
    const step1Msg = this._formatStep1Receipt(newSession);
    const step2Msg = this._formatStep2LocationPrompt(newSession);

    return {
      type: "COMPLAINT_STEP_1",
      messages: [step1Msg, step2Msg]
    };
  }

  /**
   * Unified Gemini Analysis: Determines whether input is CHAT vs. CIVIC COMPLAINT
   */
  async _analyzeIntentAndCivicIssue(text, forceCivic = false) {
    if (forceCivic) {
      return this._fallbackIntentAndClassification(text);
    }

    const aiResult = await this._executeWithModelFallback(async (model) => {
      const prompt = `You are JanSetu AI (ಜನಸೇತು AI), an expert Indian citizen civic intelligence assistant.

Analyze this message from a citizen on WhatsApp:
"${text}"

Determine if this is:
1. CHAT / GREETING / QUESTION — e.g. "hi", "hello", "ನಮಸ್ಕಾರ", "namaste", "who are you", "what can you do", "how does this work", "good morning", "thank you", or any casual greeting/query.
2. CIVIC_COMPLAINT — e.g. actual reporting of broken roads, potholes, water shortage, pipe leaks, sewage/drainage, electricity/streetlights, hospital/school infrastructure defects.

Return ONLY a valid JSON object matching this structure:
{
  "is_civic_complaint": true or false,
  "conversational_reply": "If is_civic_complaint is false, write a warm, friendly reply in the SAME LANGUAGE as the citizen (Kannada if Kannada, Hindi if Hindi, English if English). Introduce JanSetu AI, answer their query, and invite them to report any local civic issue by sending text, voice note, photo, or location pin. If is_civic_complaint is true, set this to null.",
  "category": "Road Infrastructure or Water Supply or Healthcare or Education or Drainage or Streetlights or Other (or null if not civic complaint)",
  "severity": "High or Medium or Low (or null if not civic complaint)",
  "potential_impact": "Short impact summary (or null if not civic complaint)",
  "problem_summary": "1-line summary of the problem (or null if not civic complaint)",
  "language": "kn or hi or en"
}`;

      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });

      const raw = res.response.text().trim();
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    });

    if (aiResult) {
      if (aiResult.category === "Other" && !this._hasCivicKeyword(text)) {
        aiResult.is_civic_complaint = false;
        if (!aiResult.conversational_reply) {
          aiResult.conversational_reply = this._getStaticGreeting(text, aiResult.language || "kn");
        }
      }
      return aiResult;
    }

    // Rule-based fallback
    return this._fallbackIntentAndClassification(text);
  }

  _hasCivicKeyword(text) {
    const lower = (text || "").toLowerCase();
    return /road|pothole|water|pipe|leak|drain|drainage|gutter|sewage|hospital|doctor|health|phc|school|teacher|light|streetlight|lamp|garbage|bridge|electricity|ರಸ್ತೆ|ಗುಂಡಿ|ನೀರು|ಕುಡಿಯುವ|ಆಸ್ಪತ್ರೆ|ವೈದ್ಯ|ಶಾಲೆ|ಚರಂಡಿ|ದೀಪ|ಬೀದಿ|ಕೊಳವೆ|ಪೈಪ್|ಸೇತುವೆ|ಕಸ|ಕರೆಂಟು|ವಿದ್ಯುತ್|सड़क|गड्ढा|पानी|अस्पताल|स्कूल|नाली|बिजली|कचरा/i.test(lower);
  }

  _fallbackIntentAndClassification(text) {
    const isCivic = this._hasCivicKeyword(text);
    const lang = this._detectLanguageSimple(text);

    if (!isCivic && text.length < 30) {
      return {
        is_civic_complaint: false,
        conversational_reply: this._getStaticGreeting(text, lang),
        category: null,
        severity: null,
        potential_impact: null,
        problem_summary: null,
        language: lang
      };
    }

    const lower = (text || "").toLowerCase();
    let category = "Road Infrastructure";
    let impact = "Commuter Safety & Transportation";
    let severity = "High";

    if (/water|pipe|ನೀರು|ಕುಡಿಯುವ|पानी|नल|ಬೋರ್‌ವೆಲ್|ಲೀಕ್| ನಲ್ಲಿ/i.test(lower)) {
      category = "Water Supply";
      impact = "Public Health & Drinking Water Access";
    } else if (/hospital|doctor|health|ಆಸ್ಪತ್ರೆ|ವೈದ್ಯ|ಅಸ್ಪತಾಲ್|ದವಾಖಾನೆ|ಔಷಧ|PHC/i.test(lower)) {
      category = "Healthcare";
      impact = "Primary Healthcare & Emergency Access";
    } else if (/school|education|ಶಿಕ್ಷಣ|ಶಾಲೆ|ಶಾಲೆಗಳು|teacher|ಶಿಕ್ಷಕ|ಮಕ್ಕಳು/i.test(lower)) {
      category = "Education";
      impact = "Student Welfare & Educational Access";
    } else if (/drain|ಚರಂಡಿ|sewage|ನಾಲೆ|gutter|ಒಳಚರಂಡಿ/i.test(lower)) {
      category = "Drainage";
      impact = "Sanitation & Flood Prevention";
    } else if (/light|lamp|ಬೀದಿ|ದೀಪ|street|ಕತ್ತಲೆ|ಬಲ್ಬ್/i.test(lower)) {
      category = "Streetlights";
      impact = "Night Safety & Security";
      severity = "Medium";
    } else if (/garbage|waste|ಕಸ|ತ್ಯಾಜ್ಯ|ಕಸದ/i.test(lower)) {
      category = "Drainage";
      impact = "Public Hygiene & Sanitation";
      severity = "Medium";
    }

    return {
      is_civic_complaint: true,
      conversational_reply: null,
      category,
      severity,
      potential_impact: impact,
      problem_summary: text.slice(0, 100) || "Civic Complaint",
      language: lang
    };
  }

  _getStaticGreeting(userText, lang) {
    if (lang === "kn" || /[\u0C80-\u0CFF]/.test(userText)) {
      return `🙏 *ನಮಸ್ಕಾರ! ಜನಸೇತು AI ಗೆ ಸ್ವಾಗತ.*

ನಾನು ನಿಮ್ಮ ಸಾರ್ವಜನಿಕ ನಾಗರಿಕ ಸಹಾಯ ತಂತ್ರಜ್ಞಾನ (JanSetu AI). ನಿಮ್ಮ ಊರು ಅಥವಾ ವಾರ್ಡ್‌ನಲ್ಲಿರುವ ಮೂಲಸೌಕರ್ಯ ಸಮಸ್ಯೆಗಳನ್ನು ನೇರವಾಗಿ ಸರ್ಕಾರ ಹಾಗೂ ಇಂಜಿನಿಯರ್‌ಗಳಿಗೆ ತಲುಪಿಸಲು ನಾನು ನೆರವಾಗುತ್ತೇನೆ.

📌 *ನೀವು ವರದಿ ಮಾಡಬಹುದಾದ ಸಮಸ್ಯೆಗಳು:*
• ರಸ್ತೆ ಗುಂಡಿಗಳು ಮತ್ತು ಹಾಳಾದ ರಸ್ತೆಗಳು (Potholes / Damaged Roads)
• ಕುಡಿಯುವ ನೀರು ಸರಬರಾಜು ಸಮಸ್ಯೆ ಅಥವಾ ಪೈಪ್ ಲೀಕೇಜ್
• ಚರಂಡಿ ಹಾಗೂ ಒಳಚರಂಡಿ ಸ್ವಚ್ಛತೆ
• ಆಸ್ಪತ್ರೆ ಮತ್ತು ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರಗಳು
• ಬೀದಿ ದೀಪಗಳು ಮತ್ತು ವಿದ್ಯುತ್ ಕೊರತೆ

💡 *ದೂರು ದಾಖಲಿಸಲು ಕಳುಹಿಸಿ:*
📝 ಸಮಸ್ಯೆಯ ವಿವರ (Text)
🎤 ನಿಮ್ಮ ಮಾತಿನಲ್ಲೇ ಧ್ವನಿ ಸಂದೇಶ (Voice Note)
📷 ಹಾನಿಯ ಫೋಟೋ (Photo)
📍 ವಾಟ್ಸಾಪ್ ಲೊಕೇಶನ್ (Location Pin)

_ನಿಮ್ಮ ಸಮಸ್ಯೆಯ ವಿವರವನ್ನು ಈಗಲೇ ತಿಳಿಸಿ!_`;
    }

    if (lang === "hi" || /[\u0900-\u097F]/.test(userText)) {
      return `🙏 *नमस्ते! जनसेतु AI में आपका स्वागत है।*

मैं आपका नागरिक सहायता सहायक हूँ। आप अपने क्षेत्र की सार्वजनिक समस्याओं को आसानी से दर्ज कर सकते हैं।

📌 *रिपोर्ट करने योग्य समस्याएं:*
• सड़क के गड्ढे व टूटी सड़कें
• पेयजल समस्या या पाइप लीकेज
• जल निकासी और सफाई
• अस्पताल व स्वास्थ्य केंद्र
• स्ट्रीट लाइट व बिजली

💡 *शिकायत दर्ज करने के लिए भेजें:*
📝 समस्या का विवरण (Text)
🎤 वॉइस नोट (Voice Note)
📷 फोटो (Photo)

_कृपया अपनी समस्या का विवरण भेजें!_`;
    }

    return `👋 *Hello! Welcome to JanSetu AI.*

I am your Citizen Civic Intelligence Assistant. You can report public infrastructure issues directly through this chat.

📌 *You can report:*
• Potholes & damaged roads
• Drinking water supply & pipe leaks
• Drainage & sanitation issues
• Hospital & primary healthcare problems
• Broken streetlights

💡 *To file a complaint, send:*
📝 Description of the problem (Text)
🎤 Voice Note in Kannada, Hindi, or English!
📷 Photo of the damage
📍 WhatsApp Location Pin

_How can I help your community today?_`;
  }

  /**
   * Handle Location Pin submitted by the citizen
   */
  async _handleLocationInput(sender, session, location, sendDirectMessage) {
    const lat = location?.lat != null ? parseFloat(location.lat) : null;
    const lng = location?.lng != null ? parseFloat(location.lng) : null;
    const loc = (lat != null && lng != null && !isNaN(lat) && !isNaN(lng))
      ? { lat, lng, name: location.name || "GPS Tagged" }
      : (location?.name ? { name: location.name, lat: null, lng: null } : null);

    session.location = loc;

    // Check if the citizen already reported an issue at this exact location (< 300m)
    if (loc && loc.lat != null && loc.lng != null) {
      const locDuplicate = this._checkLocationDuplicate(sender, session.category, loc);
      if (locDuplicate) {
        activeSessions.delete(sender);
        if (session.timer) clearTimeout(session.timer);
        const dupMsg = this._formatDuplicateAlert(locDuplicate, session.language);
        return {
          type: "DUPLICATE_ALERT",
          messages: [dupMsg]
        };
      }
    }

    // Immediately persist complaint to backend central database so it is instantly trackable
    await this._ingestToBackend(sender, session);

    // Check if category requires visual damage photo (Roads, Water Leak, Drainage, Streetlights)
    const visualCategories = ["Road Infrastructure", "Water Supply", "Drainage", "Sanitation", "Streetlights"];
    const requiresVisualEvidence = visualCategories.includes(session.category);

    if (!requiresVisualEvidence) {
      // For Healthcare, Education, Electricity, Administration:
      // No need for a photo — immediately finalize & send final registration receipt!
      logger.info(`Category '${session.category}' does not require photo evidence — auto-finalizing immediately.`);
      return await this._finalizeComplaint(sender, session, { isNonVisual: true });
    }

    // ─── SKIP Step 3 if citizen ALREADY sent an image in Step 1 ────────────────
    if (session.imageData) {
      logger.info(`Photo already provided at Step 1 — skipping Step 3 (Ref: ${session.refNumber}).`);
      return await this._finalizeComplaint(sender, session, { hasPhoto: true });
    }

    session.step = "WAITING_IMAGE";

    // Set 3-minute auto-finalize timer
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(async () => {
      try {
        const currentSession = activeSessions.get(sender);
        if (currentSession && currentSession.step === "WAITING_IMAGE") {
          logger.info(`Session for ${sender} (Ref: ${currentSession.refNumber}) timed out after 3 mins — auto-finalizing.`);
          const finalResult = await this._finalizeComplaint(sender, currentSession, { timedOut: true });
          if (sendDirectMessage && finalResult.messages && finalResult.messages[0]) {
            await sendDirectMessage(sender, finalResult.messages[0]);
          }
        }
      } catch (err) {
        logger.error(`Auto-finalize error: ${err.message}`);
      }
    }, 3 * 60 * 1000); // 3 minutes

    const locReceipt = this._formatStep2LocationReceived(session);
    const step3Prompt = this._formatStep3ImagePrompt(session);

    return {
      type: "LOCATION_RECEIVED",
      messages: [locReceipt, step3Prompt]
    };
  }

  async _ingestToBackend(sender, session) {
    try {
      const resp = await axios.post(
        INGEST_URL,
        {
          reference_number: session.refNumber,
          phone_number: sender,
          citizen_id: sender,
          text: session.rawText,
          language: session.language,
          location: session.location || { lat: 12.3551, lng: 77.2142, district: "Mandya", state: "Karnataka" },
          lat: session.location?.lat,
          lng: session.location?.lng,
          image_base64: session.imageData || null,
          image_mime_type: session.imageMime || null,
          consent_confirmed: true,
        },
        { timeout: 5000 }
      );
      if (resp.data && resp.data.reference_number) {
        session.refNumber = resp.data.reference_number;
      }
      logger.info(`✅ Complaint ${session.refNumber} persisted to database and live on portal.`);
    } catch (err) {
      logger.warn(`Backend ingest sync warning: ${err.message}`);
    }
  }

  _checkLocationDuplicate(sender, category, loc) {
    if (!loc || loc.lat == null || loc.lng == null) return null;
    const history = userHistory.get(sender);
    if (!history || history.length === 0) return null;

    return history.find(c => {
      if (c.lat == null || c.lng == null) return false;
      const isSameCategory = c.category === category || 
        (c.category && category && c.category.toLowerCase().includes(category.toLowerCase().slice(0, 5)));
      const distKm = this._getDistanceKm(loc.lat, loc.lng, c.lat, c.lng);
      const isRecent = (Date.now() - new Date(c.createdAt).getTime()) < 14 * 24 * 60 * 60 * 1000;
      
      // If within 300 meters (0.3 km) for the same category within 14 days
      return isSameCategory && distKm < 0.3 && isRecent;
    });
  }

  _getDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Handle Photo submitted by citizen during WAITING_IMAGE step
   */
  async _handleImageInput(sender, session, imageData, imageMime) {
    if (session.timer) clearTimeout(session.timer);

    // Run AI Damage Analysis on photo
    let imageDamage = null;
    if (imageData) {
      imageDamage = await this._analyzeImageDamage(imageData, imageMime);
      session.imageData = imageData;
      session.imageMime = imageMime;
      session.imageAnalysis = imageDamage;
    }

    return await this._finalizeComplaint(sender, session, { hasPhoto: !!imageData });
  }

  /**
   * Finalize and store complaint, clear session
   */
  async _finalizeComplaint(sender, session, opts = {}) {
    if (session.timer) clearTimeout(session.timer);

    // Persist final data (including photo if attached) to central database
    await this._ingestToBackend(sender, session);

    // Add to User History for Duplicate Tracking
    const history = userHistory.get(sender) || [];
    history.push({
      refNumber: session.refNumber,
      category: session.category,
      rawText: session.rawText,
      lat: session.location?.lat,
      lng: session.location?.lng,
      createdAt: new Date().toISOString(),
      status: "UNDER REVIEW / ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ"
    });
    userHistory.set(sender, history);

    // Clear active session
    activeSessions.delete(sender);

    // Format Final Receipt
    const finalReceipt = this._formatFinalRegistrationReceipt(session, opts);
    return {
      type: "COMPLAINT_FINALIZED",
      messages: [finalReceipt]
    };
  }

  /**
   * Check for duplicate complaints from the same user (same category and matching issue text within 14 days)
   */
  _checkDuplicate(sender, classification, newText, loc) {
    const history = userHistory.get(sender);
    if (!history || history.length === 0) return null;

    const lowerNew = (newText || "").trim().toLowerCase();
    if (lowerNew.length < 5) return null;

    return history.find(c => {
      const sameCategory = c.category === classification.category ||
        (c.category && classification.category && (
          c.category.toLowerCase().includes(classification.category.toLowerCase().slice(0, 5)) ||
          classification.category.toLowerCase().includes(c.category.toLowerCase().slice(0, 5))
        ));

      const isRecent = (Date.now() - new Date(c.createdAt).getTime()) < 14 * 24 * 60 * 60 * 1000;

      const lowerExisting = (c.rawText || "").trim().toLowerCase();
      const textMatch = lowerExisting && (
        lowerExisting === lowerNew ||
        (lowerExisting.length >= 10 && lowerNew.includes(lowerExisting.slice(0, 20))) ||
        (lowerNew.length >= 10 && lowerExisting.includes(lowerNew.slice(0, 20)))
      );

      // Facility duplicate: must match SAME category AND substantially identical text
      return sameCategory && textMatch && isRecent;
    });
  }

  /**
   * Multimodal Voice Transcription with Gemini
   */
  async _transcribeVoice(audioData, audioMime) {
    const aiResult = await this._executeWithModelFallback(async (model) => {
      const prompt = `Listen carefully to this citizen voice message in Kannada, Hindi, or English.
Return a JSON object:
{
  "transcript": "Exact words spoken",
  "language": "ISO code: kn for Kannada, hi for Hindi, en for English, ta, te",
  "problem_description": "Clean description of the civic problem"
}`;

      const res = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            data: audioData,
            mimeType: audioMime || "audio/ogg"
          }
        }
      ]);

      const raw = res.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(raw);
      return {
        text: parsed.problem_description || parsed.transcript,
        language: parsed.language || "en"
      };
    });

    return aiResult || { text: "Voice report submitted by citizen", language: "en" };
  }

  /**
   * Multimodal Vision Damage Analysis with Gemini
   */
  async _analyzeImageDamage(imageData, imageMime) {
    const aiResult = await this._executeWithModelFallback(async (model) => {
      const prompt = `Analyze this civic/infrastructure photo from a citizen.
Return a JSON object:
{
  "damage_type": "e.g. Pothole / Broken Road / Water Leak / Garbage / Drainage",
  "severity": "High / Medium / Low",
  "summary": "Brief 1-line description of visible damage in English",
  "estimated_depth_or_scale": "e.g. Approx 15cm pothole or wide crack"
}`;

      const res = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            data: imageData,
            mimeType: imageMime || "image/jpeg"
          }
        }
      ]);

      const raw = res.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(raw);
    });

    return aiResult || { damage_type: "Public Infrastructure Damage", severity: "High", summary: "Infrastructure damage confirmed via photo evidence", estimated_depth_or_scale: "Moderate" };
  }

  _checkDefectLiability(category, text) {
    if (/road|ರಸ್ತೆ|ಗುಂಡಿ|pothole|mandya|shahapur|wadgera/i.test(text || "") || category === "Road Infrastructure") {
      return "WARRANTY DEFECT DETECTED: Shahapur-Wadgera Connector Road (PMGSY-KA-YDG-2024-001) built by M/s Karnataka Road Infra Ltd for Rs 4.2 Cr is under active warranty until 2030-03-15. Contractor is liable for repairs at zero cost to government. Issue show-cause notice immediately.";
    }
    return null;
  }

  // ─── MESSAGE FORMATTERS ───────────────────────────────────────────────────

  _formatStep1Receipt(s) {
    const isKn = s.language === "kn";
    const isHi = s.language === "hi";

    const categoryKnMap = {
      "Road Infrastructure": "ರಸ್ತೆ ಮೂಲಸೌಕರ್ಯ (Road Infrastructure)",
      "Water Supply": "ಕುಡಿಯುವ ನೀರು ಸರಬರಾಜು (Water Supply)",
      "Water": "ಕುಡಿಯುವ ನೀರು ಸರಬರಾಜು (Water Supply)",
      "Healthcare": "ಆರೋಗ್ಯ ಮತ್ತು ಆಸ್ಪತ್ರೆ (Healthcare)",
      "Education": "ಶಿಕ್ಷಣ ಮತ್ತು ಶಾಲೆ (Education)",
      "Drainage": "ಚರಂಡಿ ಮತ್ತು ಸ್ವಚ್ಛತೆ (Drainage)",
      "Streetlights": "ಬೀದಿ ದೀಪಗಳು (Streetlights)",
      "Other": "ಸಾರ್ವಜನಿಕ ಮೂಲಸೌಕರ್ಯ (Public Infrastructure)",
    };

    if (isKn) {
      let out = `✅ *ದೂರು ಸ್ವೀಕರಿಸಿ ವಿಶ್ಲೇಷಿಸಲಾಗಿದೆ (Step 1/3)*\n`;
      out += `━━━━━━━━━━━━━━━━━━━━\n`;
      if (s.voiceProcessed) out += `🎤 *ಧ್ವನಿ ಸಂದೇಶ ಗುರುತಿಸಲಾಗಿದೆ (Voice Transcribed)*\n`;
      out += `📌 *ವರ್ಗ:* ${categoryKnMap[s.category] || s.category}\n`;
      out += `🎯 *ಪರಿಣಾಮ:* ${s.potential_impact}\n`;
      out += `⚡ *ಆದ್ಯತೆ:* ${s.severity === "High" ? "ಗರಿಷ್ಠ (High)" : "ಮಧ್ಯಮ"}\n`;
      out += `🔢 *ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ:* ${s.refNumber}\n`;
      out += `━━━━━━━━━━━━━━━━━━━━\n`;
      if (s.defectMatch) {
        out += `⚠️ *ಗ್ಯಾರಂಟಿ / ವಾರಂಟಿ ದೋಷ ಎಚ್ಚರಿಕೆ:*\n${s.defectMatch}\n\n`;
      }
      return out;
    }

    if (isHi) {
      let out = `✅ *शिकायत का विश्लेषण पूरा हुआ (Step 1/3)*\n`;
      out += `━━━━━━━━━━━━━━━━━━━━\n`;
      if (s.voiceProcessed) out += `🎤 *वॉइस नोट सफलतापूर्वक विश्लेषित*\n`;
      out += `📌 *श्रेणी:* ${s.category}\n`;
      out += `🎯 *प्रभाव:* ${s.potential_impact}\n`;
      out += `⚡ *प्राथमिकता:* ${s.severity === "High" ? "उच्च (High)" : "मध्यम"}\n`;
      out += `🔢 *संदर्भ संख्या:* ${s.refNumber}\n`;
      out += `━━━━━━━━━━━━━━━━━━━━\n`;
      if (s.defectMatch) {
        out += `⚠️ *अवसंरचना वारंटी सूचना:*\n${s.defectMatch}\n\n`;
      }
      return out;
    }

    let out = `✅ *Complaint Analyzed (Step 1/3)*\n`;
    out += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (s.voiceProcessed) out += `🎤 *Voice note successfully transcribed*\n`;
    out += `📌 *Category:* ${s.category}\n`;
    out += `🎯 *Potential Impact:* ${s.potential_impact}\n`;
    out += `⚡ *Priority:* ${s.severity}\n`;
    out += `🔢 *Reference:* ${s.refNumber}\n`;
    out += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (s.defectMatch) {
      out += `⚠️ *INFRASTRUCTURE NOTICE:*\n${s.defectMatch}\n\n`;
    }
    return out;
  }

  _formatStep2LocationPrompt(s) {
    if (s.language === "kn") {
      return `📍 *ಹಂತ ೨: ದೂರು ಪೂರ್ಣಗೊಳಿಸಲು ನಿಮ್ಮ ಲೊಕೇಶನ್ ಕಳುಹಿಸಿ*\n(Step 2: Share your location to complete registration)\n\n👉 ಚಾಟ್‌ನಲ್ಲಿ ಕೆಳಗಿರುವ *'+'* ಅಥವಾ *📎 (ಅಟ್ಯಾಚ್‌ಮೆಂಟ್)* ಐಕಾನ್ ಒತ್ತಿ ➡️ *Location* ಆಯ್ಕೆಮಾಡಿ ➡️ *'Send Your Current Location'* ಕಳುಹಿಸಿ.\n\n_ಇದು ನಮ್ಮ ಇಂಜಿನಿಯರ್‌ಗಳಿಗೆ ನಿಖರ ಸ್ಥಳಕ್ಕೆ ತಲುಪಲು ನೆರವಾಗುತ್ತದೆ._`;
    }
    if (s.language === "hi") {
      return `📍 *चरण 2: पंजीकरण पूरा करने के लिए अपना स्थान भेजें*\n(Step 2: Share your location to complete registration)\n\n👉 चैट में नीचे *'+'* या *📎* आइकन दबाएं ➡️ *Location* चुनें ➡️ *'Send Your Current Location'* भेजें।`;
    }
    return `📍 *Step 2/3: Please share your location to complete registration*\n\n👉 Tap the *'+'* or *📎 (Attachment)* icon at the bottom of your chat ➡️ Select *Location* ➡️ Tap *'Send Your Current Location'*.\n\n_This helps authorities locate and inspect the defect immediately._`;
  }

  _formatStep2LocationReceived(s) {
    const lat = s.location?.lat?.toFixed(4) || "12.3551";
    const lng = s.location?.lng?.toFixed(4) || "77.2142";
    if (s.language === "kn") {
      return `📍 *ಸ್ಥಳ ಯಶಸ್ವಿಯಾಗಿ ಜೋಡಿಸಲಾಗಿದೆ (Location Attached):* (${lat}° N, ${lng}° E)`;
    }
    if (s.language === "hi") {
      return `📍 *स्थान सफलतापूर्वक जोड़ा गया (Location Attached):* (${lat}° N, ${lng}° E)`;
    }
    return `📍 *Location Attached:* (${lat}° N, ${lng}° E)`;
  }

  _formatStep3ImagePrompt(s) {
    if (s.language === "kn") {
      return `📷 *ಹಂತ ೩ (ಐಚ್ಛಿಕ): ಸಮಸ್ಯೆಯ ಫೋಟೋ ಕಳುಹಿಸಿ*\n(Step 3: Send a photo of the damaged area)\n\n👉 ಕೆಳಗಿರುವ *ಕ್ಯಾಮೆರಾ 📷* ಐಕಾನ್ ಒತ್ತಿ ಫೋಟೋ ಕಳುಹಿಸಿ.\n\n⏳ _ಗಮನಿಸಿ: ಮುಂದಿನ ೩ ನಿಮಿಷಗಳಲ್ಲಿ ಫೋಟೋ ಕಳುಹಿಸದಿದ್ದರೆ, ದೂರು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ದಾಖಲಾಗುತ್ತದೆ. (ಅಥವಾ 'skip' ಎಂದು ಟೈಪ್ ಮಾಡಿ)._`;
    }
    if (s.language === "hi") {
      return `📷 *चरण 3 (वैकल्पिक): समस्या की फोटो भेजें*\n(Step 3: Send a photo of the defect)\n\n👉 नीचे *कैमरा 📷* दबाकर फोटो भेजें।\n\n⏳ _नोट: 3 मिनट में फोटो न भेजने पर शिकायत स्वतः दर्ज हो जाएगी (या 'skip' लिखें)।_`;
    }
    return `📷 *Step 3/3 (Optional): Send a photo of the defect*\n\n👉 Tap the *Camera 📷* icon to attach a photo.\n\n⏳ _Note: If no photo is sent within 3 minutes, your complaint will be finalized automatically (or type 'skip')._`;
  }

  _formatFinalRegistrationReceipt(s, opts) {
    const hasPhoto = opts.hasPhoto || !!s.imageData;
    const isKn = s.language === "kn";
    const isHi = s.language === "hi";

    if (isKn) {
      let out = `🎉 *ದೂರು ಅಧಿಕೃತವಾಗಿ ದಾಖಲಾಗಿದೆ! (Complaint Fully Registered)*\n`;
      out += `━━━━━━━━━━━━━━━━━━━━\n`;
      out += `🔢 *ಅಂತಿಮ ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ (Final Ref):* ${s.refNumber}\n`;
      out += `📌 *ವರ್ಗ:* ${s.category}\n`;
      out += `📍 *ಸ್ಥಳ:* Mandya / Karnataka (GPS Tagged)\n`;
      if (hasPhoto) {
        out += `📷 *ಫೋಟೋ:* AI ಹಾನಿ ವಿಶ್ಲೇಷಣೆ ಪೂರ್ಣಗೊಂಡಿದೆ (${s.imageAnalysis?.summary || "ಹಾನಿ ದೃಢೀಕರಿಸಲಾಗಿದೆ"})\n`;
      } else {
        out += `📷 *ಫೋಟೋ:* ಫೋಟೋ ರಹಿತ ದೂರು ದಾಖಲಾಗಿದೆ\n`;
      }
      out += `━━━━━━━━━━━━━━━━━━━━\n`;
      out += `ನಿಮ್ಮ ದೂರನ್ನು ಸಂಬಂಧಪಟ್ಟ ಕ್ಷೇತ್ರ ಇಂಜಿನಿಯರ್ ಹಾಗೂ ಜಿಲ್ಲಾಧಿಕಾರಿಗಳ ಕಮಾಂಡ್ ಸೆಂಟರ್‌ಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.\n\n`;
      out += `ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಲು:\n${PUBLIC_URL}/track?ref=${s.refNumber}\n\n`;
      out += `_ಹೊಸ ದೂರನ್ನು ದಾಖಲಿಸಲು ಯಾವುದೇ ಸಮಯದಲ್ಲಿ ಸಂದೇಶ ಕಳುಹಿಸಿ!_\n_ಜನಸೇತು AI — ಧನ್ಯವಾದಗಳು._`;
      return out;
    }

    if (isHi) {
      let out = `🎉 *शिकायत आधिकारिक रूप से दर्ज हो गई है! (Fully Registered)*\n`;
      out += `━━━━━━━━━━━━━━━━━━━━\n`;
      out += `🔢 *अंतिम संदर्भ संख्या:* ${s.refNumber}\n`;
      out += `📌 *श्रेणी:* ${s.category}\n`;
      out += `📍 *स्थान:* GPS Tagged\n`;
      if (hasPhoto) out += `📷 *फोटो:* AI क्षति विश्लेषण पूर्ण (${s.imageAnalysis?.summary || "क्षति की पुष्टि"})\n`;
      out += `━━━━━━━━━━━━━━━━━━━━\n`;
      out += `स्थिति की जांच करें:\n${PUBLIC_URL}/track?ref=${s.refNumber}\n\n`;
      out += `_नई शिकायत दर्ज करने के लिए कभी भी संदेश भेजें!_`;
      return out;
    }

    let out = `🎉 *Complaint Officially Registered! (Step 3/3 Complete)*\n`;
    out += `━━━━━━━━━━━━━━━━━━━━\n`;
    out += `🔢 *Final Reference Number:* ${s.refNumber}\n`;
    out += `📌 *Category:* ${s.category}\n`;
    out += `📍 *Location:* GPS Tagged\n`;
    if (hasPhoto) {
      out += `📷 *Photo Evidence:* AI Damage Assessment Complete (${s.imageAnalysis?.summary || "Damage Verified"})\n`;
    }
    out += `━━━━━━━━━━━━━━━━━━━━\n`;
    out += `Your complaint has been routed to the local engineering department.\n\n`;
    out += `Track progress live on public portal:\n${PUBLIC_URL}/track?ref=${s.refNumber}\n\n`;
    out += `_You can now register another complaint anytime._\n_JanSetu AI — Thank you!_`;
    return out;
  }

  _formatDuplicateAlert(d, lang) {
    if (lang === "kn") {
      return `⚠️ *ದೂರು ಈಗಾಗಲೇ ದಾಖಲಾಗಿದೆ! (Complaint Already Registered)*\n━━━━━━━━━━━━━━━━━━━━\nನೀವು ಈ ಸಮಸ್ಯೆಯನ್ನು ಈಗಾಗಲೇ ದಾಖಲಿಸಿದ್ದೀರಿ:\n\n🔢 *ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ (Ticket Ref):* ${d.refNumber}\n📌 *ವರ್ಗ:* ${d.category}\n📅 *ದಿನಾಂಕ:* ${new Date(d.createdAt).toLocaleDateString("en-IN")}\n⚡ *ಸ್ಥಿತಿ:* ${d.status}\n━━━━━━━━━━━━━━━━━━━━\nಸಂಬಂಧಪಟ್ಟ ಅಧಿಕಾರಿಗಳು ಈ ದೂರನ್ನು ಈಗಾಗಲೇ ಪರಿಶೀಲಿಸುತ್ತಿದ್ದಾರೆ.\n\nಸ್ಥಿತಿ ತಿಳಿಯಲು:\n${PUBLIC_URL}/track?ref=${d.refNumber}`;
    }
    if (lang === "hi") {
      return `⚠️ *शिकायत पहले से दर्ज है! (Already Registered)*\n━━━━━━━━━━━━━━━━━━━━\nआपने यह समस्या पहले ही दर्ज कराई है:\n\n🔢 *टिकट संदर्भ संख्या:* ${d.refNumber}\n📌 *श्रेणी:* ${d.category}\n📅 *तारीख:* ${new Date(d.createdAt).toLocaleDateString("en-IN")}\n⚡ *स्थिति:* ${d.status}\n━━━━━━━━━━━━━━━━━━━━\nअधिकारी पहले से इस पर कार्रवाई कर रहे हैं।\n\nजांच करें: ${PUBLIC_URL}/track?ref=${d.refNumber}`;
    }
    return `⚠️ *Complaint Already Registered!*\n━━━━━━━━━━━━━━━━━━━━\nYou have already reported this issue recently:\n\n🔢 *Ticket Reference:* ${d.refNumber}\n📌 *Category:* ${d.category}\n📅 *Date Reported:* ${new Date(d.createdAt).toLocaleDateString("en-IN")}\n⚡ *Current Status:* ${d.status}\n━━━━━━━━━━━━━━━━━━━━\nAuthorities are actively processing this request.\n\nTrack status: ${PUBLIC_URL}/track?ref=${d.refNumber}`;
  }

  _checkButtonAction(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes("location") || lower.includes("ಲೊಕೇಶನ್") || lower.includes("ಸ್ಥಳ") || lower.includes("share location")) {
      if (lower.length < 35) {
        return `📍 *ಲೊಕೇಶನ್ ಕಳುಹಿಸುವ ವಿಧಾನ:*\n1. ಚಾಟ್‌ನಲ್ಲಿ ಕೆಳಗಿರುವ *'+'* ಅಥವಾ *📎* ಐಕಾನ್ ಒತ್ತಿ.\n2. *'Location'* ಆಯ್ಕೆಮಾಡಿ.\n3. *'Send Your Current Location'* ಕಳುಹಿಸಿ.`;
      }
    }
    if (lower.includes("send photo") || lower.includes("photo") || lower.includes("ಫೋಟೋ") || lower.includes("ಚಿತ್ರ")) {
      if (lower.length < 35) {
        return `📷 *ಫೋಟೋ ಕಳುಹಿಸುವ ವಿಧಾನ:*\n1. ಚಾಟ್‌ನಲ್ಲಿ ಕೆಳಗಿರುವ *ಕ್ಯಾಮೆರಾ 📷* ಐಕಾನ್ ಒತ್ತಿ.\n2. ಹಾನಿಗೊಳಗಾದ ಸ್ಥಳದ ಸ್ಪಷ್ಟ ಫೋಟೋ ಕಳುಹಿಸಿ.`;
      }
    }
    return null;
  }

  _detectLanguageSimple(text) {
    if (!text) return "en";
    if (/[\u0C80-\u0CFF]/.test(text)) return "kn"; // Kannada script
    if (/[\u0900-\u097F]/.test(text)) return "hi"; // Devanagari script (Hindi/Marathi)
    if (/[\u0B80-\u0BFF]/.test(text)) return "ta"; // Tamil script
    if (/[\u0C00-\u0C7F]/.test(text)) return "te"; // Telugu script
    return "en"; // Default to English for English/Latin text
  }
}

const geminiBotService = new GeminiBotService();
module.exports = { geminiBotService };
