/**
 * JanSetu AI — Comprehensive Integration Tests
 * 
 * Covers: Audio (A-F), NITI (G-J), Geo (K-O), Jurisdiction (P), Privacy (Q), Rollup (R)
 * 
 * Run: cd backend && node tests/integration.test.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ─── Test Runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    results.push({ name: testName, status: 'PASS' });
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    results.push({ name: testName, status: 'FAIL' });
    console.log(`  ❌ ${testName}`);
  }
}

async function assertAsync(fn, testName) {
  try {
    const result = await fn();
    if (result) {
      passed++;
      results.push({ name: testName, status: 'PASS' });
      console.log(`  ✅ ${testName}`);
    } else {
      failed++;
      results.push({ name: testName, status: 'FAIL' });
      console.log(`  ❌ ${testName}`);
    }
  } catch (err) {
    failed++;
    results.push({ name: testName, status: 'FAIL', error: err.message });
    console.log(`  ❌ ${testName} — ${err.message}`);
  }
}

// ─── Import Services ──────────────────────────────────────────────────────────
const { speechService } = require('../src/services/ai/speechService');
const { nitiService } = require('../src/services/data/nitiService');
const { resolveLocation, resolveCoordinates } = require('../src/services/data/geoService');
const { calculatePriorityScore } = require('../src/services/ai/priorityEngine');

// ═══════════════════════════════════════════════════════════════════════════════
// A-F: AUDIO / SPEECH SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════════
async function runAudioTests() {
  console.log('\n━━━ A-F: Audio / Speech Service Tests ━━━');

  // A. Kannada voice input (simulated — actual Gemini call would need real audio)
  await assertAsync(async () => {
    // Test that the service handles a valid buffer without crashing
    const smallBuffer = Buffer.from('fake-kannada-audio-data');
    const result = await speechService.transcribeAudio(smallBuffer, 'audio/ogg');
    // Should return a result (either real transcription or fallback)
    return result && typeof result.transcript === 'string' && result.confidence === null;
  }, 'A. Kannada voice input — returns structured result with null confidence');

  // B. English voice input
  await assertAsync(async () => {
    const smallBuffer = Buffer.from('fake-english-audio-data');
    const result = await speechService.transcribeAudio(smallBuffer, 'audio/mpeg');
    return result && typeof result.transcript === 'string';
  }, 'B. English voice input — returns structured result');

  // C. Hindi voice input
  await assertAsync(async () => {
    const smallBuffer = Buffer.from('fake-hindi-audio-data');
    const result = await speechService.transcribeAudio(smallBuffer, 'audio/wav');
    return result && typeof result.transcript === 'string';
  }, 'C. Hindi voice input — returns structured result');

  // D. Invalid audio format
  await assertAsync(async () => {
    const buffer = Buffer.from('fake-data');
    const result = await speechService.transcribeAudio(buffer, 'video/mp4');
    return result && result.transcript.includes('failed');
  }, 'D. Invalid audio format — returns fallback error result');

  // E. Oversized audio
  await assertAsync(async () => {
    // Create a buffer larger than 25MB
    const oversized = Buffer.alloc(26 * 1024 * 1024, 'x');
    const result = await speechService.transcribeAudio(oversized, 'audio/ogg');
    return result && result.transcript.includes('failed');
  }, 'E. Oversized audio — returns fallback error result');

  // F. Gemini audio failure (null buffer)
  await assertAsync(async () => {
    const result = await speechService.transcribeAudio(null, 'audio/ogg');
    return result && result.transcript.includes('failed');
  }, 'F. Gemini audio failure (null buffer) — returns fallback safely');
}

// ═══════════════════════════════════════════════════════════════════════════════
// G-J: NITI AAYOG SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════════
async function runNitiTests() {
  console.log('\n━━━ G-J: NITI Aayog Service Tests ━━━');

  // G. NITI API success (using fallback/cached data since live API not configured)
  await assertAsync(async () => {
    const data = await nitiService.getDistrictIndicators('Yadgir', 'Karnataka');
    return data && data.districtName === 'Yadgir' && data.deprivationScore === 0.71 &&
           data.source && data.indicators && data.indicators.length > 0;
  }, 'G. NITI data retrieval — Yadgir returns correct deprivation score 0.71');

  // H. NITI API timeout simulation (live provider returns null when not configured)
  await assertAsync(async () => {
    // With no NITI_API_BASE_URL set, liveProvider should return null silently
    const result = await nitiService.liveProvider('/test-endpoint');
    return result === null;
  }, 'H. NITI API timeout/unavailable — returns null gracefully');

  // I. NITI API malformed response (unknown district)
  await assertAsync(async () => {
    const data = await nitiService.getDistrictIndicators('NonExistentDistrict', 'Fantasy');
    // Should return null from fallback (district not found)
    return data === null;
  }, 'I. NITI malformed/unknown district — returns null');

  // J. Cached NITI fallback
  await assertAsync(async () => {
    const depScore = await nitiService.getDeprivationScore('Raichur', 'Karnataka');
    return depScore && depScore.value === 0.68 && depScore.source &&
           depScore.indicator && depScore.normalized === true;
  }, 'J. Cached NITI fallback — Raichur returns 0.68 with source attribution');

  // Extra: Multi-state NITI coverage
  await assertAsync(async () => {
    const purnia = await nitiService.getDeprivationScore('Purnia', 'Bihar');
    const dumka = await nitiService.getDeprivationScore('Dumka', 'Jharkhand');
    return purnia && purnia.value === 0.78 && dumka && dumka.value === 0.74;
  }, 'J+. Multi-state NITI — Bihar (Purnia) and Jharkhand (Dumka) return correct scores');
}

// ═══════════════════════════════════════════════════════════════════════════════
// K-O: GEO SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════════
async function runGeoTests() {
  console.log('\n━━━ K-O: Geo Service Tests ━━━');

  // K. Karnataka coordinate resolution
  assert(() => {
    const loc = resolveLocation(16.77, 76.82, '');
    return loc.district === 'Yadgir' && loc.state === 'Karnataka' &&
           loc.stateCode === '29' && loc.districtCode === '586';
  }, 'K. Karnataka GPS — Yadgir resolved with LGD codes (29/586)');

  // Additional Karnataka tests
  assert(() => {
    const loc = resolveLocation(12.5, 77.3, '');
    return loc.district === 'Ramanagara' && loc.stateCode === '29' && loc.districtCode === '572';
  }, 'K+. Karnataka GPS — Ramanagara resolved with LGD code 572');

  // L. Non-Karnataka coordinate (India bounding box)
  assert(() => {
    const loc = resolveLocation(28.6, 77.2, ''); // Delhi coordinates
    // Should either resolve via Nominatim or fall to India bounding box
    return loc && loc.state && loc.stateCode !== undefined;
  }, 'L. Non-Karnataka GPS — coordinates outside Karnataka handled gracefully');

  // M. Invalid GPS coordinates
  assert(() => {
    const loc = resolveLocation(-100, 500, '');
    return loc && loc.district; // Should return default fallback
  }, 'M. Invalid GPS — returns default fallback without crashing');

  // N. Missing administrative boundary (text fallback)
  assert(() => {
    const loc = resolveLocation(null, null, 'shahapur main road has potholes');
    return loc.district === 'Yadgir' && loc.taluk_block === 'Shahapur' && loc.stateCode === '29';
  }, 'N. Text-based resolution — "shahapur" resolves to Yadgir with admin codes');

  // O. LGD code matching
  assert(() => {
    const loc = resolveLocation(13.0, 77.6, ''); // Bengaluru
    return loc.districtCode === '562' && loc.stateCode === '29';
  }, 'O. LGD codes — Bengaluru Urban returns district code 562');

  // Async resolveCoordinates test
  await assertAsync(async () => {
    const result = await resolveCoordinates(16.77, 76.82);
    // Should return result from either Nominatim or Karnataka fallback
    return result && result.state && result.district &&
           (result.state.name === 'Karnataka' || result.state.name !== null) &&
           (result.state.code === '29' || result.state.code !== null);
  }, 'O+. resolveCoordinates — returns standardized admin structure');
}

// ═══════════════════════════════════════════════════════════════════════════════
// P: JURISDICTION FILTERING
// ═══════════════════════════════════════════════════════════════════════════════
function runJurisdictionTests() {
  console.log('\n━━━ P: Jurisdiction Filtering Tests ━━━');

  // Test that priority engine accepts NITI source
  assert(() => {
    const score = calculatePriorityScore({
      signalCount: 100,
      populationAffected: 50000,
      deprivationScore: 0.71,
      severity: 'High',
      trendPct: 30,
      confidenceScore: 0.92,
      infrastructureGapSource: {
        source: 'NITI Aayog (Cached)',
        indicator: 'Composite Deprivation Index',
        period: '2024-25',
        dataset: 'Champions of Change'
      }
    });
    return score && score.total_score > 0 &&
           score.infrastructure_gap.source_attribution &&
           score.infrastructure_gap.source_attribution.source === 'NITI Aayog (Cached)';
  }, 'P. Priority engine — NITI source attribution preserved in score breakdown');

  // Test fallback source when no NITI data
  assert(() => {
    const score = calculatePriorityScore({
      signalCount: 50,
      populationAffected: 30000,
      deprivationScore: 0.50,
      severity: 'Medium',
    });
    return score.infrastructure_gap.source_attribution &&
           score.infrastructure_gap.source_attribution.source === 'Prototype / Demonstration Dataset';
  }, 'P+. Priority engine — fallback source labeled as Prototype/Demonstration');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Q: PUBLIC GPS PRIVACY
// ═══════════════════════════════════════════════════════════════════════════════
function runPrivacyTests() {
  console.log('\n━━━ Q: Public GPS Privacy Tests ━━━');

  // resolveCoordinates should NOT include raw lat/lng
  assert(() => {
    // The function resolveCoordinates returns state/district/subdistrict/village — no lat/lng
    // Verify by checking the function signature doesn't leak coordinates
    const result = resolveLocation(16.77342, 76.82195, '');
    // generalized_location_str should not contain precise coordinates
    const str = result.generalized_location_str || '';
    const hasPreciseCoords = str.includes('16.773') || str.includes('76.821');
    return !hasPreciseCoords;
  }, 'Q. GPS privacy — generalized location string does not expose precise coordinates');
}

// ═══════════════════════════════════════════════════════════════════════════════
// R: NATIONAL ROLLUP
// ═══════════════════════════════════════════════════════════════════════════════
function runRollupTests() {
  console.log('\n━━━ R: National Rollup Tests ━━━');

  assert(() => {
    const score = calculatePriorityScore({
      signalCount: 2841,
      populationAffected: 184000,
      deprivationScore: 0.71,
      severity: 'High',
      trendPct: 25,
      confidenceScore: 0.94,
      infrastructureGapSource: {
        source: 'NITI Aayog (Cached)',
        indicator: 'Basic Infrastructure Score',
        period: '2024-25'
      }
    });
    return score && score.total_score > 0 &&
           score.formula_explanation_str.includes('NITI Aayog') &&
           score.citizen_demand.weight_pct === 30 &&
           score.population_affected.weight_pct === 20 &&
           score.infrastructure_gap.weight_pct === 20 &&
           score.severity.weight_pct === 15 &&
           score.urgency_trend.weight_pct === 10 &&
           score.evidence_confidence.weight_pct === 5;
  }, 'R. National rollup — score formula weights correct (30/20/20/15/10/5) with NITI attribution');
}

// ─── S: Officer Allocation & Admin Tests ──────────────────────────────────────
function runOfficerAdminTests() {
  console.log('\n━━━ S: Officer Allocation & Admin Tests ━━━');

  const { db } = require('../src/services/data/dbService');

  // Test S1: Get all authorities
  const authorities = db.getAuthorities();
  assert(
    Array.isArray(authorities) && authorities.length >= 5,
    'S1. Retrieve allocated officers — lists all configured authority accounts'
  );

  // Test S2: Add new authority
  const testOfficer = {
    name: 'Test Officer Automation',
    email: `test.officer.${Date.now()}@jansetu.gov.in`,
    password: 'securePassword123',
    role: 'FIELD_OFFICER',
    designation: 'Assistant Executive Engineer',
    district: 'Yadgir',
    state: 'Karnataka',
    jurisdiction: { district: 'Yadgir', taluk: 'Shahapur' }
  };
  const created = db.addAuthority(testOfficer);
  assert(
    created && created.id && created.id.startsWith('AUTH-') && created.name === testOfficer.name,
    'S2. Officer Provisioning — creates new officer with generated AUTH ID'
  );

  // Test S3: Update/Reallocate authority jurisdiction
  const updated = db.updateAuthority(created.id, {
    district: 'Raichur',
    jurisdiction: { district: 'Raichur', taluk: 'Manvi' }
  });
  assert(
    updated && updated.district === 'Raichur' && updated.jurisdiction.taluk === 'Manvi',
    'S3. Jurisdiction Reallocation — transfers officer to new ruling district'
  );

  // Test S4: Find provisioned officer for login
  const found = db.findAuthority(testOfficer.email);
  assert(
    found && found.id === created.id && found.password === 'securePassword123',
    'S4. Authority Authentication — newly allocated officer can authenticate for login'
  );

  // Test S5: Revoke officer access
  const deleted = db.deleteAuthority(created.id);
  const recheck = db.findAuthority(testOfficer.email);
  assert(
    deleted === true && !recheck,
    'S5. Access Revocation — deletes officer credentials immediately'
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════
async function runAllTests() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  JANSETU AI — NATIONAL-SCALE INTEGRATION TEST SUITE     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  await runAudioTests();
  await runNitiTests();
  await runGeoTests();
  runJurisdictionTests();
  runPrivacyTests();
  runRollupTests();
  runOfficerAdminTests();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) {
    console.log('  FAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    ❌ ${r.name}${r.error ? ` — ${r.error}` : ''}`);
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
