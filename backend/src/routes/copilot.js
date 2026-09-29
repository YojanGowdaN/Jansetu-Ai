const express = require('express');
const { geminiService } = require('../services/ai/geminiService');
const { db } = require('../services/data/dbService');

const router = express.Router();

/**
 * POST /api/copilot/query
 * AI Policy Copilot — sends real data context to Gemini for evidence-backed answers
 */
router.post('/query', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required.' });
  }

  try {
    // Gather real data context from JSON files
    const signals = db.getSignals();
    const issues = db.getIssues();
    const projects = db.getProjects();

    const dataContext = {
      total_signals: signals.length,
      signals_sample: signals.slice(0, 10).map(s => ({
        ref: s.reference_number,
        category: s.category,
        severity: s.severity,
        district: s.location ? s.location.district : '',
        text: s.raw_input_text,
      })),
      hotspot_issues: issues.map(i => ({
        id: i.issue_id,
        title: i.title,
        category: i.category,
        district: i.district,
        priority_score: i.priority_score,
        signal_count: i.signal_count,
      })),
      projects: projects.slice(0, 5),
    };

    const answer = await geminiService.queryPolicyCopilot(query, dataContext);

    return res.json({
      query,
      answer,
      data_context_summary: {
        signals_analyzed: signals.length,
        hotspots_identified: issues.length,
        projects_tracked: projects.length,
      },
    });
  } catch (err) {
    console.error('[Copilot] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
