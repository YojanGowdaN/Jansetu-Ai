const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const REAL_DATA_PATH = path.join(DATA_DIR, 'real', 'niti_aayog_sample.json');

// Built-in expanded dataset for demo purposes
const BUILT_IN_CACHE = [
  { state: 'Karnataka', stateCode: 'KA', district: 'Yadgir', score: 0.71, isReal: true },
  { state: 'Karnataka', stateCode: 'KA', district: 'Raichur', score: 0.68, isReal: true },
  { state: 'Karnataka', stateCode: 'KA', district: 'Ramanagara', score: 0.42, isReal: true },
  { state: 'Bihar', stateCode: 'BR', district: 'Purnia', score: 0.78, isReal: false },
  { state: 'Bihar', stateCode: 'BR', district: 'Gaya', score: 0.73, isReal: false },
  { state: 'Bihar', stateCode: 'BR', district: 'Sitamarhi', score: 0.76, isReal: false },
  { state: 'Jharkhand', stateCode: 'JH', district: 'Dumka', score: 0.74, isReal: false },
  { state: 'Jharkhand', stateCode: 'JH', district: 'Godda', score: 0.72, isReal: false },
  { state: 'Rajasthan', stateCode: 'RJ', district: 'Jaisalmer', score: 0.58, isReal: false },
  { state: 'Rajasthan', stateCode: 'RJ', district: 'Dholpur', score: 0.65, isReal: false },
  { state: 'Madhya Pradesh', stateCode: 'MP', district: 'Barwani', score: 0.70, isReal: false },
  { state: 'Madhya Pradesh', stateCode: 'MP', district: 'Khandwa', score: 0.63, isReal: false },
  { state: 'Uttar Pradesh', stateCode: 'UP', district: 'Bahraich', score: 0.75, isReal: false },
  { state: 'Uttar Pradesh', stateCode: 'UP', district: 'Balrampur', score: 0.73, isReal: false },
  { state: 'Odisha', stateCode: 'OR', district: 'Malkangiri', score: 0.77, isReal: false },
  { state: 'Odisha', stateCode: 'OR', district: 'Nabarangpur', score: 0.71, isReal: false },
  { state: 'Maharashtra', stateCode: 'MH', district: 'Nandurbar', score: 0.67, isReal: false },
  { state: 'Maharashtra', stateCode: 'MH', district: 'Osmanabad', score: 0.59, isReal: false }
];

class NitiService {
  constructor() {
    this.apiUrl = process.env.NITI_API_BASE_URL;
    this.apiKey = process.env.NITI_API_KEY;
    this.timeoutMs = parseInt(process.env.NITI_API_TIMEOUT_MS || '10000', 10);
    this.hasLiveCredentials = Boolean(this.apiUrl && this.apiKey);
  }

  async liveProvider(endpoint, options = {}) {
    if (!this.hasLiveCredentials) {
      return null;
    }

    const url = `${this.apiUrl}${endpoint}`;
    let retries = 1;

    while (retries >= 0) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        
        const response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`NITI API responded with status: ${response.status}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        if (retries === 0) {
          console.error(`Live NITI API provider failed: ${error.message}`);
          return null; // Silent failure to allow fallback
        }
        retries--;
      }
    }
    return null;
  }

  fallbackProvider(districtName, stateName) {
    try {
      // Try loading real NITI data file (array of district objects)
      let realData = [];
      if (fs.existsSync(REAL_DATA_PATH)) {
        const fileContent = fs.readFileSync(REAL_DATA_PATH, 'utf-8');
        realData = JSON.parse(fileContent);
        if (!Array.isArray(realData)) realData = [];
      }
      
      const searchDistrict = districtName ? districtName.toLowerCase() : '';
      const searchState = stateName ? stateName.toLowerCase() : '';

      // Search real data file first (niti_aayog_sample.json uses 'district' and 'state' fields)
      let found = null;
      const realEntry = realData.find(d => 
        d.district && d.district.toLowerCase() === searchDistrict && 
        (!searchState || (d.state && d.state.toLowerCase() === searchState))
      );

      if (realEntry) {
        found = {
          districtName: realEntry.district,
          stateName: realEntry.state,
          stateCode: realEntry.aspirational_district_code ? realEntry.aspirational_district_code.split('_')[1] : 'KA',
          districtCode: realEntry.aspirational_district_code || 'XX',
          deprivationScore: realEntry.deprivation_score,
          isReal: realEntry.source_metadata ? realEntry.source_metadata.is_real_data : true,
          indicators: [
            { indicator: 'Basic Infrastructure Score', value: realEntry.basic_infra_score, unit: 'index', period: '2024-25' },
            { indicator: 'Health & Nutrition Score', value: realEntry.health_nutrition_score, unit: 'index', period: '2024-25' },
            { indicator: 'Education Score', value: realEntry.education_score, unit: 'index', period: '2024-25' },
            { indicator: 'Agriculture & Water Score', value: realEntry.agriculture_water_score, unit: 'index', period: '2024-25' },
            { indicator: 'Financial Inclusion Score', value: realEntry.financial_inclusion_score, unit: 'index', period: '2024-25' }
          ].filter(ind => ind.value !== undefined && ind.value !== null)
        };
      }

      // Try built-in cache if not found in real data
      if (!found) {
        const builtIn = BUILT_IN_CACHE.find(d => 
            d.district.toLowerCase() === searchDistrict && 
            (!searchState || d.state.toLowerCase() === searchState)
        );
        if (builtIn) {
            found = {
                districtName: builtIn.district,
                stateName: builtIn.state,
                stateCode: builtIn.stateCode,
                districtCode: `AD_${builtIn.stateCode}_0X`,
                deprivationScore: builtIn.score,
                isReal: builtIn.isReal,
                indicators: [
                  { indicator: 'Composite Deprivation Index', value: builtIn.score, unit: 'index', period: '2024-25' }
                ]
            };
        }
      }

      if (found) {
          return {
              source: found.isReal ? 'NITI Aayog (Cached)' : 'Prototype / Demonstration Dataset',
              dataset: 'Champions of Change — Aspirational Districts',
              stateCode: found.stateCode || 'XX',
              districtCode: found.districtCode || 'XXX',
              districtName: found.districtName,
              indicators: found.indicators || [],
              deprivationScore: found.deprivationScore,
              retrievedAt: new Date().toISOString(),
              source_metadata: { is_real_data: found.isReal !== false }
          };
      }

      return null;
    } catch (error) {
      console.error('Fallback provider error:', error);
      return null;
    }
  }

  async getDistrictIndicators(districtName, stateName = null) {
      try {
        const liveData = await this.liveProvider(`/districts?name=${encodeURIComponent(districtName)}`);
        if (liveData && liveData.data) {
           return {
              source: 'NITI Aayog',
              dataset: 'Champions of Change — Aspirational Districts',
              stateCode: liveData.data.stateCode,
              districtCode: liveData.data.districtCode,
              districtName: liveData.data.districtName,
              indicators: liveData.data.indicators || [],
              deprivationScore: liveData.data.deprivationScore,
              retrievedAt: new Date().toISOString(),
              source_metadata: { is_real_data: true }
           };
        }
      } catch (err) {}

      // Fallback
      return this.fallbackProvider(districtName, stateName);
  }

  async getStateIndicators(stateCode) {
    try {
        const liveData = await this.liveProvider(`/states/${encodeURIComponent(stateCode)}`);
        if (liveData && liveData.data) {
           return {
              source: 'NITI Aayog',
              stateCode: liveData.data.stateCode,
              indicators: liveData.data.indicators || [],
              retrievedAt: new Date().toISOString()
           };
        }
    } catch(err) {}

    return {
        source: 'Prototype / Demonstration Dataset',
        stateCode: stateCode,
        indicators: [],
        retrievedAt: new Date().toISOString()
    };
  }

  async getDeprivationScore(districtName, stateName = null) {
      try {
          const districtData = await this.getDistrictIndicators(districtName, stateName);
          if (districtData) {
              return {
                  value: districtData.deprivationScore,
                  source: districtData.source,
                  indicator: 'Composite Deprivation Index',
                  period: '2024-25',
                  normalized: true
              };
          }
      } catch (err) {}

      // Universal fallback
      return {
          value: 0.5,
          source: 'Prototype / Demonstration Dataset',
          indicator: 'Composite Deprivation Index (Fallback)',
          period: '2024-25',
          normalized: true
      };
  }

  async syncNitiData() {
      try {
          const liveData = await this.liveProvider('/sync');
          if (liveData) {
              return { success: true, timestamp: new Date().toISOString(), source: 'NITI Aayog' };
          }
      } catch(err) {}
      
      return { success: true, timestamp: new Date().toISOString(), source: 'Fallback' };
  }
}

const nitiService = new NitiService();
module.exports = { nitiService };
