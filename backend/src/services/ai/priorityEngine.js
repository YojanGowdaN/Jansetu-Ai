/**
 * Calculates evidence-backed, priority-ranked score (0.0 - 100.0)
 * using the official JanSetu 6-Factor Weighted Formula:
 * 
 * 1. Citizen Demand       : 30%
 * 2. Population Affected  : 20%
 * 3. Infrastructure Gap    : 20% (NITI Aayog deprivation score)
 * 4. Severity             : 15%
 * 5. Urgency / Trend       : 10%
 * 6. Evidence Confidence  : 5%
 */
function calculatePriorityScore(input) {
  const signalCount = input.signalCount || 10;
  const populationAffected = input.populationAffected || 10000;
  const deprivationScore = input.deprivationScore || 0.50;
  const severity = input.severity || 'Medium';
  const trendPct = input.trendPct !== undefined ? input.trendPct : 25;
  const confidenceScore = input.confidenceScore !== undefined ? input.confidenceScore : 0.90;

  // Infrastructure gap source attribution (from NITI Aayog or fallback)
  const infraGapSource = input.infrastructureGapSource || null;

  // 1. Citizen Demand (30%)
  const normDemand = Math.min(1.0, signalCount / 3000);
  const demandFactor = {
    raw_val: `${signalCount.toLocaleString()} signals`,
    normalized_val: Number(normDemand.toFixed(2)),
    weight_pct: 30,
    weighted_score: Number((normDemand * 30).toFixed(1)),
  };

  // 2. Population Affected (20%)
  const normPop = Math.min(1.0, populationAffected / 200000);
  const popFactor = {
    raw_val: `${populationAffected.toLocaleString()} people`,
    normalized_val: Number(normPop.toFixed(2)),
    weight_pct: 20,
    weighted_score: Number((normPop * 20).toFixed(1)),
  };

  // 3. Infrastructure Gap (20%) — with NITI source attribution
  const normInfra = Math.min(1.0, Math.max(0.0, deprivationScore));
  const infraFactor = {
    raw_val: `Deprivation Index ${deprivationScore.toFixed(2)}`,
    normalized_val: Number(normInfra.toFixed(2)),
    weight_pct: 20,
    weighted_score: Number((normInfra * 20).toFixed(1)),
  };

  // Attach source attribution if available
  if (infraGapSource) {
    infraFactor.source_attribution = {
      value: deprivationScore,
      source: infraGapSource.source || 'Unknown',
      indicator: infraGapSource.indicator || 'Deprivation Score',
      period: infraGapSource.period || 'N/A',
      dataset: infraGapSource.dataset || null,
      normalized: true,
    };
  } else {
    infraFactor.source_attribution = {
      value: deprivationScore,
      source: 'Prototype / Demonstration Dataset',
      indicator: 'Deprivation Score (Hardcoded Fallback)',
      period: 'N/A',
      normalized: true,
    };
  }

  // 4. Severity (15%)
  const normSev = severity === 'High' ? 1.0 : severity === 'Medium' ? 0.6 : 0.3;
  const sevFactor = {
    raw_val: severity,
    normalized_val: Number(normSev.toFixed(2)),
    weight_pct: 15,
    weighted_score: Number((normSev * 15).toFixed(1)),
  };

  // 5. Urgency / Trend (10%)
  const normTrend = Math.min(1.0, Math.max(0.2, trendPct / 40));
  const trendFactor = {
    raw_val: `+${trendPct}% signals in 60d`,
    normalized_val: Number(normTrend.toFixed(2)),
    weight_pct: 10,
    weighted_score: Number((normTrend * 10).toFixed(1)),
  };

  // 6. Evidence Confidence (5%)
  const normConf = Math.min(1.0, Math.max(0.1, confidenceScore));
  const confFactor = {
    raw_val: `${Math.round(confidenceScore * 100)}% evidence confidence`,
    normalized_val: Number(normConf.toFixed(2)),
    weight_pct: 5,
    weighted_score: Number((normConf * 5).toFixed(1)),
  };

  const totalScore = Number(
    (
      demandFactor.weighted_score +
      popFactor.weighted_score +
      infraFactor.weighted_score +
      sevFactor.weighted_score +
      trendFactor.weighted_score +
      confFactor.weighted_score
    ).toFixed(1)
  );

  const explanationStr =
    `Citizen Demand: ${demandFactor.raw_val} -> ${demandFactor.normalized_val} x 30% = ${demandFactor.weighted_score} | ` +
    `Population: ${popFactor.raw_val} -> ${popFactor.normalized_val} x 20% = ${popFactor.weighted_score} | ` +
    `Infra Gap: ${infraFactor.raw_val} -> ${infraFactor.normalized_val} x 20% = ${infraFactor.weighted_score} [${infraFactor.source_attribution.source}] | ` +
    `Severity: ${sevFactor.raw_val} -> ${sevFactor.normalized_val} x 15% = ${sevFactor.weighted_score} | ` +
    `Urgency: ${trendFactor.raw_val} -> ${trendFactor.normalized_val} x 10% = ${trendFactor.weighted_score} | ` +
    `Evidence: ${confFactor.raw_val} -> ${confFactor.normalized_val} x 5% = ${confFactor.weighted_score} ` +
    `=> TOTAL = ${totalScore} / 100`;

  return {
    citizen_demand: demandFactor,
    population_affected: popFactor,
    infrastructure_gap: infraFactor,
    severity: sevFactor,
    urgency_trend: trendFactor,
    evidence_confidence: confFactor,
    total_score: totalScore,
    formula_explanation_str: explanationStr,
  };
}

module.exports = { calculatePriorityScore };
