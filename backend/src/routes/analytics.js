const express = require('express');
const { db } = require('../services/data/dbService');
const { runEscalationCheck } = require('../services/escalation/escalationEngine');
const { nitiService } = require('../services/data/nitiService');

const router = express.Router();

/**
 * GET /api/analytics/national-rollup
 */
router.get('/national-rollup', (_req, res) => {
  const rollup = db.getNationalRollup();
  return res.json({ count: rollup.length, national_rollup: rollup });
});

/**
 * GET /api/analytics/scorecard
 */
router.get('/scorecard', (_req, res) => {
  const scorecard = db.getScorecard();
  return res.json(scorecard);
});

/**
 * GET /api/analytics/niti-indicators/:districtName
 * Retrieve NITI Aayog indicators for a district
 */
router.get('/niti-indicators/:districtName', async (req, res) => {
  try {
    const { districtName } = req.params;
    const { state } = req.query;
    const data = await nitiService.getDistrictIndicators(districtName, state || null);
    
    if (!data) {
      return res.json({
        districtName,
        available: false,
        message: 'No NITI Aayog data available for this district.',
        source: 'N/A'
      });
    }

    return res.json({
      available: true,
      ...data
    });
  } catch (err) {
    console.error('[Analytics] NITI indicators error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve NITI indicators.' });
  }
});

/**
 * GET /api/analytics/niti-deprivation/:districtName
 * Get deprivation score for priority engine transparency
 */
router.get('/niti-deprivation/:districtName', async (req, res) => {
  try {
    const { districtName } = req.params;
    const { state } = req.query;
    const data = await nitiService.getDeprivationScore(districtName, state || null);
    return res.json(data);
  } catch (err) {
    console.error('[Analytics] NITI deprivation error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve deprivation score.' });
  }
});

/**
 * GET /api/analytics/officer-performance
 */
router.get('/officer-performance', (_req, res) => {
  const actions = db.getActionLogs();
  const signals = db.getSignals();

  const officerMap = {};
  actions.forEach(a => {
    if (a.officer_role === 'SYSTEM') return;
    const key = a.officer_name || 'Unknown';
    if (!officerMap[key]) {
      officerMap[key] = { name: key, role: a.officer_role, actions_taken: 0, cases_resolved: 0, cases_handled: [] };
    }
    officerMap[key].actions_taken++;
    if (!officerMap[key].cases_handled.includes(a.target_id)) {
      officerMap[key].cases_handled.push(a.target_id);
    }
    if (a.status === 'RESOLVED' || a.status === 'VERIFIED') {
      officerMap[key].cases_resolved++;
    }
  });

  const pendingCount = signals.filter(s => !['RESOLVED', 'VERIFIED'].includes(s.status)).length;
  const resolvedCount = signals.filter(s => ['RESOLVED', 'VERIFIED'].includes(s.status)).length;
  const rated = signals.filter(s => s.citizen_rating);
  const avgRating = rated.length > 0 ? rated.reduce((sum, s) => sum + s.citizen_rating, 0) / rated.length : 0;

  return res.json({
    officers: Object.values(officerMap),
    summary: { total_actions: actions.length, total_pending: pendingCount, total_resolved: resolvedCount, avg_citizen_rating: Math.round(avgRating * 10) / 10 }
  });
});

/**
 * GET /api/analytics/export/signals - CSV export
 */
router.get('/export/signals', (_req, res) => {
  const signals = db.getSignals();
  const headers = ['Reference', 'Category', 'Severity', 'Status', 'State', 'District', 'Description', 'Evidence', 'Created', 'Rating'];
  const rows = signals.map(s => [
    s.reference_number, s.category, s.severity, s.status,
    s.location?.state || '',
    s.location?.district || '',
    '"' + (s.raw_input_text || '').replace(/"/g, '""') + '"',
    [s.evidence?.has_text ? 'Text' : '', s.evidence?.has_image ? 'Image' : '', s.evidence?.has_voice ? 'Voice' : ''].filter(Boolean).join('+') || 'N/A',
    s.created_at, s.citizen_rating || ''
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=jansetu-signals-export.csv');
  return res.send(csv);
});

/**
 * GET /api/analytics/export/hotspots - CSV export
 */
router.get('/export/hotspots', (_req, res) => {
  const issues = db.getIssues();
  const headers = ['Issue ID', 'Title', 'Category', 'State', 'District', 'Priority Score', 'Signal Count', 'NITI Source', 'Status'];
  const rows = issues.map(i => [
    i.issue_id, '"' + (i.title || '').replace(/"/g, '""') + '"',
    i.category, i.state || '', i.district, (i.priority_score || 0).toFixed(1), i.signal_count,
    i.niti_evidence ? i.niti_evidence.source : 'N/A',
    i.status
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=jansetu-hotspots-export.csv');
  return res.send(csv);
});

/**
 * GET /api/analytics/budget-recommendations
 */
router.get('/budget-recommendations', (req, res) => {
  const issues = db.getIssues(req.query);
  if (issues.length === 0) {
    return res.json({ recommendations: [], message: 'No data available.' });
  }
  const totalBudget = 100;
  const totalScore = issues.reduce((sum, i) => sum + (i.priority_score || 0), 0) || 1;
  const schemeMap = {
    'Road Infrastructure': 'PMGSY / State PWD Maintenance Fund',
    'Water': 'Jal Jeevan Mission (JJM)',
    'Healthcare': 'National Health Mission (NHM)',
    'Education': 'Samagra Shiksha Abhiyan',
    'Drainage': 'Swachh Bharat Mission (Urban/Gramin)',
    'Streetlights': 'National Jyoti Yojana / Smart City Fund',
    'Transport': 'State Transport Infrastructure Fund'
  };
  const recommendations = issues
    .sort((a, b) => b.priority_score - a.priority_score)
    .map((issue, idx) => {
      const share = (issue.priority_score / totalScore) * totalBudget;
      return {
        rank: idx + 1, state: issue.state || 'Karnataka', district: issue.district, category: issue.category,
        priority_score: issue.priority_score, signal_count: issue.signal_count,
        recommended_allocation_cr: Math.round(share * 10) / 10,
        allocation_pct: Math.round((issue.priority_score / totalScore) * 100),
        applicable_scheme: schemeMap[issue.category] || 'General Development Fund',
        niti_source: issue.niti_evidence ? issue.niti_evidence.source : 'N/A',
        action: issue.priority_score >= 60 ? 'Immediate allocation recommended' : issue.priority_score >= 40 ? 'Include in next quarterly review' : 'Monitor and reassess'
      };
    });
  return res.json({ total_notional_budget_cr: totalBudget, recommendations, generated_at: new Date().toISOString() });
});

/**
 * POST /api/analytics/run-escalation
 */
router.post('/run-escalation', (_req, res) => {
  const result = runEscalationCheck();
  return res.json({ success: true, ...result });
});

module.exports = router;
