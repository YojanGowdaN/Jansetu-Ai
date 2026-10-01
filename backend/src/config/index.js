const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

module.exports = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5000',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  jwtSecret: process.env.JWT_SECRET || 'jansetu-development-secret-key-2026',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  escalationConfigDir: path.join(__dirname, 'escalation'),

  // NITI Aayog API Configuration
  nitiApiBaseUrl: process.env.NITI_API_BASE_URL || '',
  nitiApiKey: process.env.NITI_API_KEY || '',
  nitiApiTimeoutMs: parseInt(process.env.NITI_API_TIMEOUT_MS || '10000', 10),

  // Government Administrative Boundary / Geo API Configuration
  geoBoundaryApiUrl: process.env.GEO_BOUNDARY_API_URL || '',
  geoBoundaryApiKey: process.env.GEO_BOUNDARY_API_KEY || '',

  // LGD (Local Government Directory) API Configuration
  lgdApiUrl: process.env.LGD_API_URL || '',

  // Audio Processing Configuration
  audioMaxSizeBytes: parseInt(process.env.AUDIO_MAX_SIZE_BYTES || String(25 * 1024 * 1024), 10),
};
