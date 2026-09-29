/**
 * Geographic Resolver for JanSetu AI — National Multi-State Architecture
 * 
 * Provider chain:
 * 1. Government Boundary API (configurable, requires credentials)
 * 2. OpenStreetMap Nominatim (free, national coverage)
 * 3. Karnataka Fallback Provider (hardcoded bounding boxes with LGD codes)
 * 
 * Exposes:
 * - resolveLocation(lat, lng, text)    — backward-compatible, used by existing callers
 * - resolveCoordinates(lat, lng)       — new standardized format with admin codes
 */

const fs = require('fs');
const path = require('path');

// ─── LGD State Code Lookup ────────────────────────────────────────────────────
const LGD_STATE_CODES = {
  'andhra pradesh': '28', 'arunachal pradesh': '12', 'assam': '18', 'bihar': '10',
  'chhattisgarh': '22', 'goa': '30', 'gujarat': '24', 'haryana': '06',
  'himachal pradesh': '02', 'jharkhand': '20', 'karnataka': '29', 'kerala': '32',
  'madhya pradesh': '23', 'maharashtra': '27', 'manipur': '14', 'meghalaya': '17',
  'mizoram': '15', 'nagaland': '13', 'odisha': '21', 'punjab': '03',
  'rajasthan': '08', 'sikkim': '11', 'tamil nadu': '33', 'telangana': '36',
  'tripura': '16', 'uttar pradesh': '09', 'uttarakhand': '05', 'west bengal': '19',
  'delhi': '07', 'jammu and kashmir': '01', 'ladakh': '37', 'puducherry': '34',
  'chandigarh': '04', 'andaman and nicobar islands': '35',
  'dadra and nagar haveli and daman and diu': '26', 'lakshadweep': '31',
  // Common alternate names
  'nct of delhi': '07', 'national capital territory of delhi': '07',
};

// Karnataka district LGD codes
const KARNATAKA_DISTRICT_CODES = {
  'mandya': { code: '570', subdistricts: { 'halaguru': '5135', 'malavalli': '5135', 'mandya': '5131', 'maddur': '5132', 'pandavapura': '5133', 'srirangapatna': '5134', 'nagamangala': '5136', 'krishnarajpet': '5137' } },
  'yadgir': { code: '586', subdistricts: { 'yadgir': '5350', 'shahapur': '5351', 'shorapur': '5352', 'gurmitkal': '5353' } },
  'raichur': { code: '583', subdistricts: { 'raichur': '5303', 'sindhanur': '5304', 'manvi': '5305', 'devadurga': '5306', 'lingasugur': '5307' } },
  'ramanagara': { code: '572', subdistricts: { 'ramanagara': '5153', 'channapatna': '5154', 'magadi': '5155', 'kanakapura': '5156' } },
  'bengaluru urban': { code: '562', subdistricts: { 'bengaluru north': '5101', 'bengaluru south': '5102', 'bengaluru east': '5103', 'anekal': '5104' } },
};

// ─── Rate Limiter for Nominatim (1 req/sec) ───────────────────────────────────
let lastNominatimRequest = 0;

// ─── Provider 1: Government Boundary API (stub, requires credentials) ─────────
async function governmentBoundaryProvider(lat, lng) {
  const apiUrl = process.env.GEO_BOUNDARY_API_URL;
  const apiKey = process.env.GEO_BOUNDARY_API_KEY;
  if (!apiUrl || !apiKey) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${apiUrl}?lat=${lat}&lng=${lng}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    // Adapt to JanSetu format — exact mapping depends on API contract
    console.log('[GeoService] Government boundary API response received');
    return data;
  } catch (err) {
    console.warn('[GeoService] Government boundary API unavailable:', err.message);
    return null;
  }
}

// ─── Provider 2: OpenStreetMap Nominatim (free, national) ─────────────────────
async function nominatimProvider(lat, lng) {
  try {
    // Rate limit: 1 request per second
    const now = Date.now();
    const elapsed = now - lastNominatimRequest;
    if (elapsed < 1100) {
      await new Promise(resolve => setTimeout(resolve, 1100 - elapsed));
    }
    lastNominatimRequest = Date.now();

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'JanSetu-AI/1.0' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json();
    if (!data || !data.address) return null;

    const addr = data.address;
    const stateName = addr.state || null;
    const districtName = addr.county || addr.city_district || addr.city || null;
    const subdistrictName = addr.state_district || addr.suburb || addr.town || null;
    const villageName = addr.village || addr.hamlet || addr.neighbourhood || null;

    const stateCode = stateName ? (LGD_STATE_CODES[stateName.toLowerCase()] || null) : null;

    // Try to find district code from Karnataka lookup
    let districtCode = null;
    let subdistrictCode = null;
    if (stateCode === '29' && districtName) {
      const dLower = districtName.toLowerCase();
      if (KARNATAKA_DISTRICT_CODES[dLower]) {
        districtCode = KARNATAKA_DISTRICT_CODES[dLower].code;
        if (subdistrictName) {
          subdistrictCode = KARNATAKA_DISTRICT_CODES[dLower].subdistricts[subdistrictName.toLowerCase()] || null;
        }
      }
    }

    return {
      state: { name: stateName, code: stateCode },
      district: { name: districtName, code: districtCode },
      subdistrict: { name: subdistrictName, code: subdistrictCode },
      village: { name: villageName, code: null },
      source: 'OpenStreetMap Nominatim (Reverse Geocode)'
    };
  } catch (err) {
    console.warn('[GeoService] Nominatim unavailable:', err.message);
    return null;
  }
}

// ─── Provider 3: Karnataka Fallback (existing bounding-box logic) ─────────────
function karnatakaFallbackProvider(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || lat <= 0 || lng <= 0) return null;

  // Mandya / Halaguru region (Lat 12.15–12.75, Lng 76.5–77.3)
  if (lat >= 12.15 && lat <= 12.75 && lng >= 76.5 && lng <= 77.3) {
    const taluk = lng >= 77.1 ? 'Halaguru' : 'Mandya';
    return {
      state: { name: 'Karnataka', code: '29' },
      district: { name: 'Mandya', code: '570' },
      subdistrict: { name: taluk, code: KARNATAKA_DISTRICT_CODES['mandya'].subdistricts[taluk.toLowerCase()] || null },
      village: { name: null, code: null },
      source: 'Karnataka Demo/Fallback Provider'
    };
  }

  // Ramanagara region (Lat 12.2–12.85, Lng 77.0–77.6)
  if (lat >= 12.2 && lat <= 12.85 && lng >= 77.0 && lng <= 77.6) {
    const taluk = lat > 12.6 ? 'Ramanagara' : 'Channapatna';
    return {
      state: { name: 'Karnataka', code: '29' },
      district: { name: 'Ramanagara', code: '572' },
      subdistrict: { name: taluk, code: KARNATAKA_DISTRICT_CODES['ramanagara'].subdistricts[taluk.toLowerCase()] || null },
      village: { name: null, code: null },
      source: 'Karnataka Demo/Fallback Provider'
    };
  }

  // Yadgir region (Lat 16.3–17.15, Lng 76.4–77.55)
  if (lat >= 16.3 && lat <= 17.15 && lng >= 76.4 && lng <= 77.55) {
    const taluk = lat > 16.8 ? 'Yadgir' : 'Shahapur';
    return {
      state: { name: 'Karnataka', code: '29' },
      district: { name: 'Yadgir', code: '586' },
      subdistrict: { name: taluk, code: KARNATAKA_DISTRICT_CODES['yadgir'].subdistricts[taluk.toLowerCase()] || null },
      village: { name: null, code: null },
      source: 'Karnataka Demo/Fallback Provider'
    };
  }

  // Raichur region (Lat 15.7–16.45, Lng 76.7–77.6)
  if (lat >= 15.7 && lat <= 16.45 && lng >= 76.7 && lng <= 77.6) {
    return {
      state: { name: 'Karnataka', code: '29' },
      district: { name: 'Raichur', code: '583' },
      subdistrict: { name: 'Raichur', code: '5303' },
      village: { name: null, code: null },
      source: 'Karnataka Demo/Fallback Provider'
    };
  }

  // Bengaluru region (Lat 12.85–13.3, Lng 77.35–77.85)
  if (lat >= 12.85 && lat <= 13.3 && lng >= 77.35 && lng <= 77.85) {
    return {
      state: { name: 'Karnataka', code: '29' },
      district: { name: 'Bengaluru Urban', code: '562' },
      subdistrict: { name: 'Bengaluru South', code: '5102' },
      village: { name: null, code: null },
      source: 'Karnataka Demo/Fallback Provider'
    };
  }

  // Any other Karnataka coordinate approx
  if (lat >= 11.5 && lat <= 18.5 && lng >= 74.0 && lng <= 78.5) {
    return {
      state: { name: 'Karnataka', code: '29' },
      district: { name: 'Yadgir', code: '586' },
      subdistrict: { name: 'Shahapur', code: '5351' },
      village: { name: null, code: null },
      source: 'Karnataka Demo/Fallback Provider'
    };
  }

  // India-wide rough check
  if (lat >= 6.5 && lat <= 37.5 && lng >= 68.0 && lng <= 97.5) {
    return {
      state: { name: 'Unknown', code: null },
      district: { name: 'Unknown', code: null },
      subdistrict: { name: null, code: null },
      village: { name: null, code: null },
      source: 'India Bounding Box (No Detail)'
    };
  }

  return null;
}

// ─── Main: resolveCoordinates (new standardized format) ───────────────────────
async function resolveCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return {
      state: { name: null, code: null },
      district: { name: null, code: null },
      subdistrict: { name: null, code: null },
      village: { name: null, code: null },
      source: 'Invalid Coordinates'
    };
  }

  // Provider chain: Government API → Nominatim → Karnataka Fallback
  try {
    const govResult = await governmentBoundaryProvider(lat, lng);
    if (govResult) return govResult;
  } catch (e) { /* continue to next provider */ }

  try {
    const nomResult = await nominatimProvider(lat, lng);
    if (nomResult && nomResult.state && nomResult.state.name) return nomResult;
  } catch (e) { /* continue to next provider */ }

  const fallback = karnatakaFallbackProvider(lat, lng);
  if (fallback) return fallback;

  return {
    state: { name: null, code: null },
    district: { name: null, code: null },
    subdistrict: { name: null, code: null },
    village: { name: null, code: null },
    source: 'Unresolved'
  };
}

// ─── Backward-compatible: resolveLocation (old format + new admin codes) ──────
function resolveLocation(lat, lng, text) {
  const lowerText = (text || '').toLowerCase();
  
  // 1. Text-based detection first (preserve existing logic exactly)
  if (lowerText.includes('mandya') || lowerText.includes('halaguru') || lowerText.includes('malavalli') || lowerText.includes('maddur') || lowerText.includes('srirangapatna')) {
    const taluk = lowerText.includes('halaguru') ? 'Halaguru' : lowerText.includes('malavalli') ? 'Malavalli' : lowerText.includes('maddur') ? 'Maddur' : 'Mandya';
    const subdistrictCode = KARNATAKA_DISTRICT_CODES['mandya'].subdistricts[taluk.toLowerCase()] || null;
    return {
      district: 'Mandya',
      taluk_block: taluk,
      village_ward: 'Town Ward 04',
      state: 'Karnataka',
      generalized_location_str: `${taluk}, Mandya District, Karnataka`,
      stateCode: '29',
      districtCode: '570',
      subdistrictCode: subdistrictCode,
      geoSource: 'Text Detection'
    };
  }

  if (lowerText.includes('yadgir') || lowerText.includes('shahapur') || lowerText.includes('surpur') || lowerText.includes('shorapur')) {
    const taluk = lowerText.includes('shahapur') ? 'Shahapur' : lowerText.includes('surpur') || lowerText.includes('shorapur') ? 'Shorapur' : 'Yadgir';
    const subdistrictCode = KARNATAKA_DISTRICT_CODES['yadgir'].subdistricts[taluk.toLowerCase()] || null;
    return {
      district: 'Yadgir',
      taluk_block: taluk,
      village_ward: 'Ward 04, Central Market',
      state: 'Karnataka',
      generalized_location_str: `${taluk}, Yadgir District, Karnataka`,
      stateCode: '29',
      districtCode: '586',
      subdistrictCode: subdistrictCode,
      geoSource: 'Text Detection'
    };
  }

  if (lowerText.includes('ramanagara') || lowerText.includes('channapatna') || lowerText.includes('magadi') || lowerText.includes('kanakapura')) {
    const taluk = lowerText.includes('channapatna') ? 'Channapatna' : lowerText.includes('kanakapura') ? 'Kanakapura' : 'Ramanagara';
    const subdistrictCode = KARNATAKA_DISTRICT_CODES['ramanagara'].subdistricts[taluk.toLowerCase()] || null;
    return {
      district: 'Ramanagara',
      taluk_block: taluk,
      village_ward: 'Grama Panchayat Ward 02',
      state: 'Karnataka',
      generalized_location_str: `${taluk}, Ramanagara District, Karnataka`,
      stateCode: '29',
      districtCode: '572',
      subdistrictCode: subdistrictCode,
      geoSource: 'Text Detection'
    };
  }

  if (lowerText.includes('raichur') || lowerText.includes('manvi') || lowerText.includes('sindhanur') || lowerText.includes('devadurga')) {
    return {
      district: 'Raichur',
      taluk_block: 'Sindhanur',
      village_ward: 'APMC Ward',
      state: 'Karnataka',
      generalized_location_str: 'Sindhanur, Raichur District, Karnataka',
      stateCode: '29',
      districtCode: '583',
      subdistrictCode: '5304',
      geoSource: 'Text Detection'
    };
  }

  if (lowerText.includes('bengaluru') || lowerText.includes('bangalore') || lowerText.includes('whitefield') || lowerText.includes('indiranagar') || lowerText.includes('koramangala')) {
    return {
      district: 'Bengaluru Urban',
      taluk_block: 'Bengaluru East',
      village_ward: 'Ward 85',
      state: 'Karnataka',
      generalized_location_str: 'Bengaluru Urban, Karnataka',
      stateCode: '29',
      districtCode: '562',
      subdistrictCode: '5103',
      geoSource: 'Text Detection'
    };
  }

  // 2. Coordinate-based resolution using provider chain (synchronous fallback for backward compat)
  if (typeof lat === 'number' && typeof lng === 'number' && lat > 0 && lng > 0) {
    const fallback = karnatakaFallbackProvider(lat, lng);
    if (fallback) {
      return {
        district: fallback.district.name || 'Unknown',
        taluk_block: fallback.subdistrict.name || 'Unknown',
        village_ward: 'Resolved Ward',
        state: fallback.state.name || 'Unknown',
        generalized_location_str: `${fallback.subdistrict.name || ''}, ${fallback.district.name || ''} District, ${fallback.state.name || ''}`.trim(),
        stateCode: fallback.state.code || null,
        districtCode: fallback.district.code || null,
        subdistrictCode: fallback.subdistrict.code || null,
        geoSource: fallback.source
      };
    }
  }

  // Default focus district for demonstration
  return {
    district: 'Yadgir',
    taluk_block: 'Shahapur',
    village_ward: 'Community Sector',
    state: 'Karnataka',
    generalized_location_str: 'Shahapur, Yadgir District, Karnataka',
    stateCode: '29',
    districtCode: '586',
    subdistrictCode: '5351',
    geoSource: 'Default Fallback'
  };
}

module.exports = { resolveLocation, resolveCoordinates };
