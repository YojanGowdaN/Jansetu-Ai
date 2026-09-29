const { GoogleGenerativeAI } = require('@google/generative-ai');

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIME_TYPES = [
  'audio/ogg',
  'audio/opus',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/webm',
  'audio/ogg; codecs=opus'
];

const PROMPT = `You are JanSetu AI, a civic development intelligence system.

Listen to the attached citizen voice message.

Extract only information relevant to a civic/development request.

Return a JSON object with these fields:
- transcript: the exact words spoken
- language: ISO 639-1 language code (en, kn, hi, ta, te, mr, bn, ml, gu, pa, etc.)
- normalizedText: cleaned civic request text with obvious speech errors corrected

Do not invent facts.
Do not infer political opinions.
Do not accuse individuals, contractors, officers or departments.
Preserve locations, infrastructure problems, urgency and public-impact information when explicitly stated.`;

class SpeechService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.configuredModel = process.env.GEMINI_MODEL;
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    } else {
      this.genAI = null;
    }
  }

  async transcribeAudio(audioBuffer, mimeType) {
    try {
      if (!this.genAI) {
        console.warn('SpeechService: GEMINI_API_KEY not configured. Falling back.');
        return this._fallbackTranscribe('API key not configured');
      }

      if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
        console.error('SpeechService: Invalid audio buffer');
        return this._fallbackTranscribe('Invalid audio buffer');
      }

      if (audioBuffer.length > MAX_FILE_SIZE) {
        console.error(`SpeechService: Audio file too large. Max size is ${MAX_FILE_SIZE} bytes.`);
        return this._fallbackTranscribe('Audio file too large');
      }

      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        console.error(`SpeechService: Unsupported MIME type: ${mimeType}`);
        return this._fallbackTranscribe('Unsupported MIME type');
      }

      const modelsToTry = [
        this.configuredModel,
        'gemini-3.6-flash',
        'gemini-3.5-flash-lite'
      ].filter(Boolean);

      const inlineData = {
        inlineData: {
          data: audioBuffer.toString('base64'),
          mimeType: mimeType
        }
      };

      const generationConfig = {
        temperature: 0.1,
        responseMimeType: 'application/json'
      };

      for (const modelName of modelsToTry) {
        try {
          const model = this.genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent({
            contents: [
              {
                role: 'user',
                parts: [{ text: PROMPT }, inlineData]
              }
            ],
            generationConfig
          });

          const responseText = result.response.text();
          let parsedResponse;
          try {
            parsedResponse = JSON.parse(responseText);
          } catch (parseError) {
            console.error(`SpeechService: Failed to parse Gemini response as JSON for model ${modelName}`);
            continue; // Try next model if parsing fails
          }

          return {
            transcript: parsedResponse.transcript || '',
            language: parsedResponse.language || 'en',
            confidence: null,
            normalizedText: parsedResponse.normalizedText || ''
          };
        } catch (modelError) {
          console.error(`SpeechService: Error using model ${modelName}:`, modelError.message);
          // Try next model
        }
      }

      // If all models fail
      console.error('SpeechService: All Gemini models failed.');
      return this._fallbackTranscribe('All Gemini models failed');
      
    } catch (error) {
      console.error('SpeechService: Unexpected error in transcribeAudio:', error.message);
      return this._fallbackTranscribe(error.message);
    }
  }

  _fallbackTranscribe(reason) {
    return {
      transcript: `[Audio transcription failed: ${reason}]`,
      language: 'unknown',
      confidence: null,
      normalizedText: `[Audio transcription failed: ${reason}]`
    };
  }
}

const speechService = new SpeechService();
module.exports = { speechService };
