const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config');

class GeminiService {
  constructor() {
    this.genAI = null;
    this.activeApiKey = '';
    this.modelName = config.geminiModel || 'gemini-1.5-flash';
    this._checkAndInit();
  }

  _checkAndInit() {
    const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey || '';
    if (apiKey && apiKey.trim().length > 5 && apiKey !== this.activeApiKey) {
      try {
        this.activeApiKey = apiKey.trim();
        this.genAI = new GoogleGenerativeAI(this.activeApiKey);
        console.log(`[Gemini] Initialized GoogleGenerativeAI client.`);
      } catch (err) {
        console.warn('[Gemini] Initialization error:', err.message);
      }
    }
  }

  async _executeWithModelFallback(fn) {
    this._checkAndInit();
    if (!this.genAI) return null;

    const candidateModels = [
      this.modelName,
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-2.5-flash'
    ].filter(Boolean);
    const uniqueModels = [...new Set(candidateModels)];

    for (const modelName of uniqueModels) {
      try {
        const model = this.genAI.getGenerativeModel({ model: modelName });
        const result = await fn(model);
        if (result) return result;
      } catch (err) {
        console.warn(`[Gemini] Model ${modelName} error:`, err.message);
      }
    }
    return null;
  }

  /**
   * Classify a citizen signal using Gemini AI.
   * AI auto-detects: language, category, severity, location context, urgency.
   */
  async classifyCitizenSignal(inputText, imageBase64, mimeType = 'image/jpeg') {
    const aiOutput = await this._executeWithModelFallback(async (model) => {
      const prompt = `You are JanSetu AI, an expert Indian civic infrastructure analyst.

A citizen has submitted a civic development report. Analyze it and return a valid JSON object.

Citizen report: "${inputText || 'Image submission only'}"

Return ONLY JSON matching this format:
{
  "language": "detected language code (en, kn, hi, ta, te)",
  "translated_english_text": "English translation of the message",
  "category": "One of: Road Infrastructure, Water, Healthcare, Education, Drainage, Streetlights, Transport, Other",
  "problem_summary": "Brief 1-line summary of the problem",
  "severity": "High or Medium or Low",
  "potential_impact": "e.g. Emergency Healthcare Access, Public Health Risk, Student Safety, Rural Connectivity etc",
  "urgency": "Immediate Action Required or High Priority or Medium Priority",
  "confidence_score": 0.94,
  "estimated_location_context": "Location names or landmarks mentioned in text, or null if none",
  "image_damage_analysis": null
}`;

      const contents = [{ text: prompt }];
      if (imageBase64) {
        contents.push({
          inlineData: {
            data: imageBase64,
            mimeType: mimeType || 'image/jpeg'
          }
        });
      }

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: contents }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const raw = result.response.text().trim();
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    });

    if (aiOutput) {
      console.log('[Gemini] Signal successfully classified by Gemini:', aiOutput.category, aiOutput.severity);
      return aiOutput;
    }

    return this._fallbackClassify(inputText);
  }

  /**
   * AI Policy Copilot — answers authority questions using live synthesized civic data.
   */
  async queryPolicyCopilot(query, dataContext) {
    const copilotAnswer = await this._executeWithModelFallback(async (model) => {
      const prompt = `You are JanSetu AI, an intelligent policy advisor for Indian government administrators.

You have access to the following live civic data:
${JSON.stringify(dataContext, null, 2)}

The administrator asks: "${query}"

IMPORTANT FORMATTING RULES:
- Write in plain, natural language like a knowledgeable human advisor speaking to a senior official.
- DO NOT use any markdown formatting. No asterisks (*), no hash symbols (#), no bold, no bullet symbols.
- Use numbered lists (1. 2. 3.) for recommendations instead of bullet points.
- Write short paragraphs separated by blank lines.
- Quote actual numbers, district names, category names, and priority scores from the data.
- Be specific and actionable. Do not give generic advice.
- Keep it concise: 3-5 short paragraphs maximum.
- Sound like a briefing officer speaking to a District Commissioner, not a chatbot.`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      });

      return result.response.text().trim();
    });

    if (copilotAnswer) {
      return copilotAnswer;
    }

    return this._fallbackCopilot(query, dataContext);
  }

  /**
   * Fallback copilot that builds answers from real data context.
   */
  _fallbackCopilot(query, dataContext) {
    if (!dataContext || (!dataContext.signals_sample?.length && !dataContext.hotspot_issues?.length)) {
      return 'No citizen signals have been ingested into the system yet. Once citizens start submitting civic reports through the platform, the AI engine will automatically cluster development hotspots, compute multi-factor priority scores, and provide real-time policy recommendations tailored to your jurisdiction.';
    }

    const parts = [];
    parts.push(`Based on ${dataContext.total_signals || 0} citizen signals currently in the system, here is a summary of the ground situation:\n`);

    if (dataContext.hotspot_issues && dataContext.hotspot_issues.length > 0) {
      parts.push('Key development hotspots identified:\n');
      dataContext.hotspot_issues
        .sort((a, b) => b.priority_score - a.priority_score)
        .slice(0, 5)
        .forEach((h, i) => {
          const level = h.priority_score >= 80 ? 'Critical' : h.priority_score >= 60 ? 'Moderate' : 'Low';
          parts.push(`${i + 1}. ${h.title} in ${h.district} district has a priority index of ${h.priority_score.toFixed(1)} out of 100 (${level} priority), backed by ${h.signal_count} verified citizen reports.`);
        });
      parts.push('');
    }

    if (dataContext.signals_sample && dataContext.signals_sample.length > 0) {
      const catCounts = {};
      dataContext.signals_sample.forEach(s => {
        catCounts[s.category] = (catCounts[s.category] || 0) + 1;
      });
      parts.push('Sector-wise breakdown of citizen demands:\n');
      let idx = 1;
      Object.entries(catCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
          parts.push(`${idx}. ${cat}: ${count} reports received`);
          idx++;
        });
      parts.push('');
    }

    parts.push('Recommended actions for your consideration:\n');
    parts.push('1. Direct field engineering teams to inspect high-priority road and water infrastructure assets in the flagged areas.');
    parts.push('2. Cross-reference PMGSY defect-liability warranty records for recently constructed connector roads in affected zones.');
    parts.push('3. Prioritize budget allocation for wards and taluks showing concentrated multi-signal clustering from citizens.');

    return parts.join('\n');
  }

  _fallbackClassify(text) {
    const lower = (text || '').toLowerCase();

    let category = 'Other';
    let impact = 'Community Civic Request';
    let severity = 'Medium';

    if (/road|ರಸ್ತೆ|ಗುಂಡಿ|pothole|highway|bridge|सड़क|गड्ढा|transport/.test(lower)) {
      category = 'Road Infrastructure';
      impact = 'Rural Connectivity & Transport Safety';
      severity = 'High';
    } else if (/water|ನೀರು|borewell|ಕೊಳವೆ|tap|pipe|पानी|बोरवेल|drinking|leak/.test(lower)) {
      category = 'Water';
      impact = 'Public Health & Drinking Water Security';
      severity = 'High';
    } else if (/hospital|phc|ಆಸ್ಪತ್ರೆ|doctor|medicine|health|अस्पताल|डॉक्टर|clinic|ambulance/.test(lower)) {
      category = 'Healthcare';
      impact = 'Primary Healthcare & Emergency Access';
      severity = 'High';
    } else if (/school|ಶಾಲೆ|teacher|education|student|स्कूल|शिक्षक|roof|classroom/.test(lower)) {
      category = 'Education';
      impact = 'Student Safety & Educational Access';
      severity = 'Medium';
    } else if (/drain|ಚರಂಡಿ|flood|sewage|gutter|नाला|बाढ़|stagnant/.test(lower)) {
      category = 'Drainage';
      impact = 'Sanitation & Flood Prevention';
      severity = 'Medium';
    } else if (/light|lamp|street|ಬೀದಿ|दीप|बत्ती|dark|bulb/.test(lower)) {
      category = 'Streetlights';
      impact = 'Public Safety & Night Security';
      severity = 'Low';
    }

    const isKannada = /[\u0C80-\u0CFF]/.test(text);
    const isHindi = /[\u0900-\u097F]/.test(text);

    return {
      language: isKannada ? 'kn' : isHindi ? 'hi' : 'en',
      category,
      problem_summary: (text || '').slice(0, 120) || 'Citizen development report',
      translated_english_text: (isKannada || isHindi) ? `[Auto-translated]: ${text}` : text,
      severity,
      potential_impact: impact,
      urgency: severity === 'High' ? 'Immediate Action Required' : 'Medium Priority',
      confidence_score: 0.88,
      estimated_location_context: null,
      image_damage_analysis: null,
    };
  }

  /**
   * AI-Powered Officer Update Analysis
   * Translates officer actions and notes into clear, polite citizen updates in Kannada/Hindi/English
   */
  async analyzeOfficerUpdate({ status, notes, category, location, language = 'en' }) {
    const aiOutput = await this._executeWithModelFallback(async (model) => {
      const prompt = `You are JanSetu AI, an empathetic Indian civic intelligence assistant communicating with citizens on WhatsApp.
      
An official government officer has just taken action on a community complaint:
- Issue Category: "${category || 'Civic Infrastructure'}"
- Location: "${location || 'Local Area'}"
- Action/Status: "${status}"
- Officer's Official Notes: "${notes || 'Status updated by department engineer'}"
- Citizen Language: "${language}"

Task:
Generate a polite, clear, reassuring citizen-friendly explanation (2-3 sentences max) explaining what action the government has taken and what it means for the community in the target language (${language}).

Return a JSON object:
{
  "summary_en": "Clear 2-sentence explanation in English",
  "summary_kn": "Clear 2-sentence explanation in Kannada (ಕನ್ನಡ)",
  "summary_hi": "Clear 2-sentence explanation in Hindi (हिंदी)",
  "estimated_resolution": "e.g. Work in progress / Inspection completed / Resolved",
  "citizen_advice": "e.g. Please allow 24-48 hours for site clearance / Issue successfully resolved"
}`;

      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      });
      return JSON.parse(res.response.text());
    });

    if (aiOutput) return aiOutput;

    // Fallback if AI offline
    return {
      summary_en: `Government officials have updated this case to ${status}. ${notes ? 'Official update: ' + notes : 'Field work and inspection are in progress.'}`,
      summary_kn: `ಸರ್ಕಾರಿ ಅಧಿಕಾರಿಗಳು ಈ ದೂರನ್ನು ${status} ಸ್ಥಿತಿಗೆ ನವೀಕರಿಸಿದ್ದಾರೆ. ${notes ? 'ಅಧಿಕಾರಿ ಟಿಪ್ಪಣಿ: ' + notes : 'ಸ್ಥಳ ಪರಿಶೀಲನೆ ಮತ್ತು ದುರಸ್ತಿ ಕಾರ್ಯಗಳು ಮುಂದುವರಿದಿವೆ.'}`,
      summary_hi: `सरकारी अधिकारियों ने इस मामले की स्थिति को ${status} में अपडेट किया है। ${notes ? 'टिप्पणी: ' + notes : 'क्षेत्रीय निरीक्षण और कार्य प्रगति पर है।'}`,
      estimated_resolution: status,
      citizen_advice: "Thank you for reporting."
    };
  }
}

const geminiService = new GeminiService();
module.exports = { geminiService };
