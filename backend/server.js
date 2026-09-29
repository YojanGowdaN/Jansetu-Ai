require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./src/config');
const { apiRateLimiter } = require('./src/middleware/rateLimiter');
const { globalErrorHandler } = require('./src/middleware/errorHandler');

const signalsRoutes = require('./src/routes/signals');
const issuesRoutes = require('./src/routes/issues');
const projectsRoutes = require('./src/routes/projects');
const analyticsRoutes = require('./src/routes/analytics');
const copilotRoutes = require('./src/routes/copilot');
const authRoutes = require('./src/routes/auth');

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(apiRateLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'JanSetu AI Backend',
    gemini_configured: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

// Auto-escalation check on startup and every 6 hours
const { runEscalationCheck } = require('./src/services/escalation/escalationEngine');
try { 
  const result = runEscalationCheck();
  if (result.escalated > 0) console.log(`[Escalation] Auto-escalated ${result.escalated} overdue cases.`);
} catch(e) { console.warn('[Escalation] Startup check skipped:', e.message); }
setInterval(() => {
  try { runEscalationCheck(); } catch(e) {}
}, 6 * 60 * 60 * 1000);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/copilot', copilotRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Error handler
app.use(globalErrorHandler);

const PORT = config.port || 5000;
app.listen(PORT, () => {
  console.log(`\n  JanSetu AI Backend running on http://localhost:${PORT}`);
  console.log(`  Gemini API Key: ${process.env.GEMINI_API_KEY ? 'Configured' : 'NOT SET — using fallback classifier'}`);
  console.log(`  Health: http://localhost:${PORT}/health\n`);
});
