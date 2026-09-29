/**
 * Infrastructure Defect Liability Matcher
 * Matches citizen complaints against PMGSY/government infrastructure warranty database
 */

const PMGSY_INFRASTRUCTURE_DB = [
  { id: 'PMGSY-KA-YDG-2024-001', road_name: 'Shahapur-Wadgera Connector Road', district: 'Yadgir', taluk: 'Shahapur', contractor: 'M/s Karnataka Road Infra Ltd', completion_date: '2025-03-15', warranty_years: 5, warranty_end: '2030-03-15', lat: 16.69, lng: 76.84, category: 'Road Infrastructure', cost_cr: 4.2 },
  { id: 'PMGSY-KA-YDG-2024-002', road_name: 'Shorapur-Muddebihal Link Road', district: 'Yadgir', taluk: 'Shorapur', contractor: 'M/s Deccan Constructions', completion_date: '2024-11-20', warranty_years: 5, warranty_end: '2029-11-20', lat: 16.52, lng: 76.75, category: 'Road Infrastructure', cost_cr: 3.8 },
  { id: 'PMGSY-KA-RMN-2024-001', road_name: 'Channapatna-Ramanagara Bypass', district: 'Ramanagara', taluk: 'Channapatna', contractor: 'M/s South Infra Builders', completion_date: '2025-06-01', warranty_years: 5, warranty_end: '2030-06-01', lat: 12.65, lng: 77.21, category: 'Road Infrastructure', cost_cr: 6.5 },
  { id: 'PMGSY-KA-RCR-2023-001', road_name: 'Raichur-Lingasugur State Highway Patch', district: 'Raichur', taluk: 'Raichur', contractor: 'M/s National Highway Builders', completion_date: '2024-08-10', warranty_years: 5, warranty_end: '2029-08-10', lat: 16.21, lng: 77.36, category: 'Road Infrastructure', cost_cr: 8.1 },
  { id: 'NJY-KA-YDG-2025-001', road_name: 'Shahapur Ward 4 Streetlight Installation', district: 'Yadgir', taluk: 'Shahapur', contractor: 'M/s Bright Solutions Pvt Ltd', completion_date: '2025-09-01', warranty_years: 3, warranty_end: '2028-09-01', lat: 16.70, lng: 76.83, category: 'Streetlights', cost_cr: 0.8 },
  { id: 'JJMW-KA-YDG-2024-001', road_name: 'Shahapur Jal Jeevan Mission Pipeline', district: 'Yadgir', taluk: 'Shahapur', contractor: 'M/s Aqua Infrastructure', completion_date: '2025-01-15', warranty_years: 5, warranty_end: '2030-01-15', lat: 16.71, lng: 76.82, category: 'Water', cost_cr: 2.3 },
  { id: 'PMGSY-KA-RMN-2023-002', road_name: 'Kanakapura-Sathanur Village Road', district: 'Ramanagara', taluk: 'Kanakapura', contractor: 'M/s Vinayaka Constructions', completion_date: '2024-03-20', warranty_years: 5, warranty_end: '2029-03-20', lat: 12.55, lng: 77.42, category: 'Road Infrastructure', cost_cr: 2.9 },
  { id: 'NHM-KA-YDG-2024-001', road_name: 'Shahapur PHC Renovation', district: 'Yadgir', taluk: 'Shahapur', contractor: 'M/s Medicare Builders', completion_date: '2025-02-01', warranty_years: 3, warranty_end: '2028-02-01', lat: 16.70, lng: 76.83, category: 'Healthcare', cost_cr: 1.5 },
];

function getHaversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchInfrastructureDefect(location, category) {
  if (!location || !location.lat || !location.lng) {
    return { matched: false, is_warranty_defect: false, recommendation_note: null };
  }

  const now = new Date();
  const matches = PMGSY_INFRASTRUCTURE_DB
    .filter(asset => {
      const catMatch = !category || asset.category === category;
      const dist = getHaversineDistanceKm(location.lat, location.lng, asset.lat, asset.lng);
      return catMatch && dist <= 15;
    })
    .map(asset => {
      const dist = getHaversineDistanceKm(location.lat, location.lng, asset.lat, asset.lng);
      const warrantyActive = new Date(asset.warranty_end) > now;
      return { ...asset, distance_km: Math.round(dist * 10) / 10, warranty_active: warrantyActive };
    })
    .sort((a, b) => a.distance_km - b.distance_km);

  if (matches.length === 0) {
    return { matched: false, is_warranty_defect: false, recommendation_note: null };
  }

  const best = matches[0];
  const isWarranty = best.warranty_active;

  return {
    matched: true,
    is_warranty_defect: isWarranty,
    matched_asset: {
      id: best.id,
      name: best.road_name,
      contractor: best.contractor,
      completion_date: best.completion_date,
      warranty_end: best.warranty_end,
      cost_cr: best.cost_cr,
      distance_km: best.distance_km
    },
    recommendation_note: isWarranty
      ? `WARRANTY DEFECT DETECTED: ${best.road_name} (${best.id}) built by ${best.contractor} for Rs ${best.cost_cr} Cr is under active warranty until ${best.warranty_end}. Contractor is liable for repairs at zero cost to government. Issue show-cause notice immediately.`
      : `Nearby infrastructure: ${best.road_name} (${best.id}) by ${best.contractor}. Warranty expired. Standard maintenance budget allocation required.`
  };
}

module.exports = { matchInfrastructureDefect, getHaversineDistanceKm, PMGSY_INFRASTRUCTURE_DB };
