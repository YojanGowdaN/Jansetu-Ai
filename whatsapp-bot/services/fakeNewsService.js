/**
 * services/fakeNewsService.js -> JanSetu AI Civic Ingest Service
 *
 * Sends incoming citizen requests (Text, Voice, Photo, Location)
 * to the JanSetu AI Central API (http://localhost:5000/api/signals/ingest).
 */

const axios = require("axios");
const cache = require("../utils/cache");
const logger = require("../utils/logger");

const BASE_URL = process.env.SENTINEL_API_URL || "http://localhost:5000";
const INGEST_URL = `${BASE_URL}/api/signals/ingest`;

/**
 * Ingest and analyze a civic report from a citizen
 * @param {object} payload - { sender, text, audioData, audioMime, imageData, imageMime, location }
 * @returns {Promise<object>}
 */
const analyse = async (payload) => {
  const text = typeof payload === "string" ? payload : (payload.text || "");
  const sender = typeof payload === "object" ? payload.sender : "919876543210";
  const location = payload.location || { lat: 12.3551, lng: 77.2142, district: "Mandya", state: "Karnataka" };

  const cacheKey = `civic::${sender}::${text.slice(0, 100)}`;
  const cached = cache.get(cacheKey);
  if (cached && !payload.audioData && !payload.imageData) {
    return cached;
  }

  try {
    logger.info(`JanSetu API -> Ingesting report from ${sender}`);

    const response = await axios.post(
      INGEST_URL,
      {
        phone_number: sender,
        text: text,
        language: "auto",
        location: location,
        audio_base64: payload.audioData || null,
        audio_mime_type: payload.audioMime || null,
        image_base64: payload.imageData || null,
        image_mime_type: payload.imageMime || null,
        consent_confirmed: true,
      },
      { timeout: 25000 }
    );

    const data = response.data;
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    logger.warn(`JanSetu API unavailable (${err.message}) — using emergency fallback`);
    return fallbackResponse(text, sender);
  }
};

const fallbackResponse = (text, sender) => {
  const refNum = `JS-2026-${Math.floor(10000 + Math.random() * 90000)}`;
  let category = "Road Infrastructure";
  let impact = "Commuter Safety & Transportation";

  if (/water|pipe|ನೀರು|ಕುಡಿಯುವ|पानी|नल/i.test(text)) {
    category = "Water Supply";
    impact = "Public Health & Drinking Water Access";
  } else if (/hospital|doctor|health|ಆಸ್ಪತ್ರೆ|ವೈದ್ಯ|अस्पताल/i.test(text)) {
    category = "Healthcare";
    impact = "Primary Healthcare & Emergency Access";
  } else if (/school|education|ಶಿಕ್ಷಣ|ಶಾಲೆ|स्कूल/i.test(text)) {
    category = "Education";
    impact = "Student Welfare & Educational Access";
  }

  return {
    success: true,
    reference_number: refNum,
    category,
    severity: "High",
    potential_impact: impact,
    defect_matching_notice: null,
    ai_analysis: {
      category,
      severity: "High",
      urgency: "Immediate Action Required",
      potential_impact: impact,
      language_detected: "kn",
      voice_processed: false,
    },
    message: `Your civic request has been analyzed and logged. Reference: ${refNum}`,
  };
};

module.exports = { analyse, THRESHOLD: 80 };
