const express = require('express');
const { db } = require('../services/data/dbService');

const router = express.Router();

/**
 * GET /api/issues
 * List all hotspot issues sorted by priority score
 */
router.get('/', (req, res) => {
  const { category, district, minScore } = req.query;
  const issues = db.getIssues({
    category,
    district,
    minScore: minScore ? parseFloat(minScore) : undefined,
  });
  return res.json({ count: issues.length, issues });
});

/**
 * GET /api/issues/:issueId
 * Get a specific issue with full score breakdown
 */
router.get('/:issueId', (req, res) => {
  const issue = db.getIssueById(req.params.issueId);
  if (!issue) {
    return res.status(404).json({ error: 'Issue not found.' });
  }

  const relatedSignals = db.getSignals({ category: issue.category, district: issue.district });
  const actions = db.getActionLogs(issue.issue_id);

  return res.json({
    issue,
    related_signals: relatedSignals,
    action_logs: actions,
  });
});

module.exports = router;
