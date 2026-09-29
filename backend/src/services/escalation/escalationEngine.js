const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const CONFIG_DIR = path.join(__dirname, '..', '..', 'config', 'escalation');

function readJSON(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) { return []; }
}

function writeJSON(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
}

function loadEscalationRules() {
  try {
    const karnataka = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'karnataka.json'), 'utf-8'));
    const defaults = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'default.json'), 'utf-8'));
    return [...(karnataka.rules || []), ...(defaults.rules || [])];
  } catch (e) {
    return [
      { threshold_days: 14, severity: 'High', escalate_from: 'FIELD_OFFICER', escalate_to: 'DEPARTMENT_OFFICER', action_required: 'Formal review required' },
      { threshold_days: 30, severity: 'High', escalate_from: 'DEPARTMENT_OFFICER', escalate_to: 'DISTRICT_AUTHORITY', action_required: 'District authority escalation' },
      { threshold_days: 45, severity: 'High', escalate_from: 'DISTRICT_AUTHORITY', escalate_to: 'STATE_AUTHORITY', action_required: 'State-level intervention required' }
    ];
  }
}

function runEscalationCheck() {
  const signals = readJSON('signals.json');
  const actions = readJSON('actions.json');
  const rules = loadEscalationRules();
  const now = Date.now();
  let escalated = 0;

  signals.forEach((signal, idx) => {
    if (signal.status === 'RESOLVED' || signal.status === 'VERIFIED') return;
    
    const ageMs = now - new Date(signal.created_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const severity = (signal.severity || 'Medium').toLowerCase();

    for (const rule of rules) {
      if (ageDays >= rule.threshold_days && severity === rule.severity.toLowerCase()) {
        const alreadyEscalated = actions.some(a => 
          a.target_id === signal.reference_number && 
          a.action && a.action.includes('Auto-escalated')
        );
        if (alreadyEscalated) continue;

        signals[idx].status = 'UNDER_REVIEW';
        signals[idx].escalated = true;
        signals[idx].escalated_to = rule.escalate_to;
        signals[idx].escalation_reason = rule.action_required;
        signals[idx].latest_action = `Auto-escalated to ${rule.escalate_to}`;
        signals[idx].updated_at = new Date().toISOString();

        actions.unshift({
          action_id: `ACT-ESC-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          target_id: signal.reference_number,
          officer_name: 'JanSetu AI Escalation Engine',
          officer_role: 'SYSTEM',
          action: `Auto-escalated to ${rule.escalate_to} (${ageDays.toFixed(0)} days unresolved)`,
          status: 'UNDER_REVIEW',
          notes: rule.action_required,
          created_at: new Date().toISOString()
        });
        escalated++;
        break;
      }
    }
  });

  if (escalated > 0) {
    writeJSON('signals.json', signals);
    writeJSON('actions.json', actions);
  }

  return { checked: signals.length, escalated };
}

module.exports = { runEscalationCheck, loadEscalationRules };
