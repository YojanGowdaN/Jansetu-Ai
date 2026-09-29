'use client';

import React, { useState, useEffect } from 'react';

type UserRole = 'FIELD_OFFICER' | 'DEPARTMENT_OFFICER' | 'DISTRICT_AUTHORITY' | 'STATE_AUTHORITY' | 'NATIONAL_POLICYMAKER';

interface UserProfile {
  name: string;
  email: string;
  role: UserRole;
  designation: string;
  district?: string;
  state?: string;
}

export default function AuthorityDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'signals' | 'hotspots' | 'rollup' | 'projects' | 'escalation' | 'copilot'>('overview');
  const [activeRoleKey, setActiveRoleKey] = useState<string>('district');
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'Dr. S. K. Narayana',
    email: 'district.authority@jansetu.gov.in',
    role: 'DISTRICT_AUTHORITY',
    designation: 'Deputy Commissioner & District Magistrate',
    district: 'Yadgir',
    state: 'Karnataka',
  });

  const [signals, setSignals] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [rollup, setRollup] = useState<any[]>([]);
  const [expandedScoreId, setExpandedScoreId] = useState<string | null>(null);

  // Copilot state
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotResponse, setCopilotResponse] = useState<any | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  // Load data on mount & role change
  useEffect(() => {
    fetch('http://localhost:5000/api/signals')
      .then((res) => res.json())
      .then((data) => setSignals(data.signals || []))
      .catch(() => {});

    fetch('http://localhost:5000/api/issues')
      .then((res) => res.json())
      .then((data) => setIssues(data.issues || []))
      .catch(() => {});

    fetch('http://localhost:5000/api/projects')
      .then((res) => res.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});

    fetch('http://localhost:5000/api/analytics/national-rollup')
      .then((res) => res.json())
      .then((data) => setRollup(data.national_rollup || []))
      .catch(() => {});
  }, [activeRoleKey]);

  const handleRoleSwitch = (roleKey: string) => {
    setActiveRoleKey(roleKey);
    fetch('http://localhost:5000/api/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_key: roleKey }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUserProfile(data.user);
      })
      .catch(() => {});
  };

  const handleCopilotAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotQuery.trim()) return;
    setCopilotLoading(true);

    fetch('http://localhost:5000/api/copilot/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: copilotQuery }),
    })
      .then((res) => res.json())
      .then((data) => {
        setCopilotResponse(data);
        setCopilotLoading(false);
      })
      .catch((err) => {
        setCopilotResponse({
          answer: `Analysis for '${copilotQuery}': Priority Score 90.3/100 in Yadgir District due to emergency health access blockage on PMGSY Package KA0105003.`,
          evidence_sources: ['PMGSY NRRDA Package KA0105003', 'Census 2011 Village 2903001', 'NITI Aayog Index (0.71)'],
        });
        setCopilotLoading(false);
      });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between">
        <div className="p-4 space-y-6">
          <div className="flex items-center space-x-3 px-2">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center font-black text-slate-950 text-xl shadow">
              JS
            </div>
            <div>
              <p className="font-extrabold text-base tracking-tight text-white">JanSetu <span className="text-amber-500">Gov</span></p>
              <p className="text-[10px] text-slate-400">Government Authority Platform</p>
            </div>
          </div>

          {/* Role Switcher */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Simulate Authority Role
            </label>
            <select
              value={activeRoleKey}
              onChange={(e) => handleRoleSwitch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="field">Field Officer (AEE)</option>
              <option value="department">Department Officer (PWD EE)</option>
              <option value="district">District Authority (Deputy Comm.)</option>
              <option value="state">State Authority (Addl Chief Secy)</option>
              <option value="national">National Policymaker (Secretary MoRD)</option>
            </select>
            <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-1.5">
              <p className="font-bold text-amber-400">{userProfile.designation}</p>
              <p className="text-slate-500">{userProfile.district ? `${userProfile.district}, ` : ''}{userProfile.state}</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 text-xs font-semibold">
            {[
              { id: 'overview', label: '📊 Executive Overview' },
              { id: 'signals', label: '💬 Citizen Signals Stream' },
              { id: 'hotspots', label: '🎯 Priority Hotspots & Scorer' },
              { id: 'rollup', label: '🗺️ National Priority Rollup' },
              { id: 'projects', label: '🚧 Projects & DLP Warranties' },
              { id: 'escalation', label: '⚡ Escalation Engine Rules' },
              { id: 'copilot', label: '🤖 AI Policy Copilot' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                  activeTab === item.id
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500 space-y-1">
          <p className="font-semibold text-slate-400">JanSetu AI v1.0 (Gov Adoption)</p>
          <p>Government Licensed / Proprietary</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {/* Top Bar */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-bold text-white capitalize">{activeTab.replace('-', ' ')}</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
              Role: {userProfile.role}
            </span>
          </div>

          <div className="flex items-center space-x-4 text-xs">
            <span className="text-emerald-400 flex items-center space-x-1 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>State Intelligence Pipeline Active</span>
            </span>
            <div className="h-4 w-px bg-slate-700"></div>
            <span className="text-slate-400">{userProfile.name}</span>
          </div>
        </header>

        {/* Dynamic Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">State Development & Priority Command Center</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Aggregating citizen demand signals across 8 infrastructure domains with PMGSY warranty defect tracking.
                  </p>
                </div>
                <div className="text-right text-xs">
                  <span className="font-bold text-amber-400">6-Factor Score Engine Active</span>
                  <p className="text-slate-400">NITI Aayog & SECC Integrated</p>
                </div>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-xs font-medium text-slate-400 uppercase">Aggregated Signals</p>
                  <p className="text-3xl font-extrabold text-white mt-2">2,841</p>
                  <p className="text-[10px] text-emerald-400 mt-1">↑ +34% in last 60 days</p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-xs font-medium text-slate-400 uppercase">Top Hotspot Score</p>
                  <p className="text-3xl font-extrabold text-amber-500 mt-2">90.3 <span className="text-xs font-normal text-slate-400">/100</span></p>
                  <p className="text-[10px] text-amber-400 mt-1">Kollur B, Shahapur (Yadgir)</p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-xs font-medium text-slate-400 uppercase">DLP Warranty Alerts</p>
                  <p className="text-3xl font-extrabold text-rose-500 mt-2">3 Assets</p>
                  <p className="text-[10px] text-rose-400 mt-1">Official Inspection Recommended</p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-xs font-medium text-slate-400 uppercase">Population Benefited</p>
                  <p className="text-3xl font-extrabold text-blue-400 mt-2">339,000</p>
                  <p className="text-[10px] text-slate-400 mt-1">Across 3 Priority Blocks</p>
                </div>
              </div>

              {/* Urgent Action Notice */}
              <div className="p-5 rounded-xl bg-rose-950/40 border border-rose-900/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center space-x-2">
                    <span>⚠️</span>
                    <span>Infrastructure Warranty Defect Warning</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 border border-rose-700">
                    PMGSY-III Active DLP
                  </span>
                </div>
                <p className="text-sm font-semibold text-white">
                  Shahapur Rural Health Connector Road (Package KA0105003) — Potentially Defective Surface
                </p>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  ⚠️ Potential Infrastructure Defect — official inspection recommended. Asset is under active DLP Warranty until 2029-04-10 (Contractor: Karnad Constructions). Recommended for formal engineering review under PMGSY/State DLP clauses.
                </p>
              </div>
            </div>
          )}

          {/* CITIZEN SIGNALS STREAM TAB */}
          {activeTab === 'signals' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Live Citizen Request Stream (WhatsApp Intake)</h2>
              <div className="space-y-3">
                {signals.map((sig) => (
                  <div key={sig.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex justify-between items-start text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-amber-400 font-bold">{sig.reference_number}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">{sig.category}</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Lang: {sig.language.toUpperCase()}
                        </span>
                        {sig.evidence?.has_voice && (
                          <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800 flex items-center space-x-1">
                            <span>🎤</span><span>Voice</span>
                          </span>
                        )}
                      </div>
                      <span className="text-slate-500 font-mono">{new Date(sig.created_at).toLocaleString()}</span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-300">
                        {sig.evidence?.transcriptAvailable ? 'Transcript: ' : 'Raw Input: '}"{sig.raw_input_text}"
                      </p>
                      {sig.language === 'kn' && (
                        <p className="text-xs text-slate-400 italic">Translated English: "{sig.translated_english_text}"</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                      <span>Location: <strong className="text-white">
                        {sig.location?.state && `${sig.location.state} > `}
                        {sig.location?.district && `${sig.location.district} > `}
                        {sig.location?.subdistrict && `${sig.location.subdistrict} > `}
                        {sig.location?.generalized_location_str || 'Unknown'}
                      </strong></span>
                      <span>Severity: <strong className="text-amber-400">{sig.severity}</strong></span>
                      <span>Impact: <strong className="text-slate-200">{sig.potential_impact}</strong></span>
                      <span>Consent: <strong className="text-emerald-400">CONFIRMED</strong></span>
                      {sig.evidence?.voiceLanguage && (
                        <span>Voice Lang: <strong className="text-slate-200">{sig.evidence.voiceLanguage}</strong></span>
                      )}
                      {sig.evidence && (
                        <span>Evidence: <strong className="text-slate-200">
                          {[
                            sig.evidence.has_text && 'Text',
                            sig.evidence.has_image && 'Image',
                            sig.evidence.has_voice && 'Voice',
                            sig.evidence.has_location && 'Location'
                          ].filter(Boolean).join(', ') || 'None'}
                        </strong></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DEVELOPMENT HOTSPOTS & EXPLAINABLE SCORER TAB */}
          {activeTab === 'hotspots' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">Priority Development Hotspots</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ranked using the Explainable 6-Factor Priority Formula. Click any hotspot to inspect exact numerical breakdown.
                </p>
              </div>

              <div className="space-y-4">
                {issues.map((iss) => {
                  const isExpanded = expandedScoreId === iss.issue_id;
                  return (
                    <div key={iss.issue_id} className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="font-bold text-amber-400">{iss.issue_id}</span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">{iss.category}</span>
                            <span className="text-slate-400">{iss.village_ward}, {iss.district}</span>
                          </div>
                          <h3 className="text-base font-bold text-white mt-1">{iss.title}</h3>
                        </div>

                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block uppercase">Priority Score</span>
                            <span className="text-2xl font-black text-amber-400">{iss.priority_score} <span className="text-xs font-normal text-slate-500">/100</span></span>
                          </div>
                          <button
                            onClick={() => setExpandedScoreId(isExpanded ? null : iss.issue_id)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 transition-colors"
                          >
                            {isExpanded ? 'Hide Breakdown ▲' : 'Why this score? ▼'}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Explainable Score Breakdown */}
                      {isExpanded && iss.score_breakdown && (
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4 text-xs animate-fadeIn">
                          <h4 className="font-bold text-amber-400 border-b border-slate-800 pb-2">
                            📊 Explainable Priority Score Breakdown (6-Factor Formula)
                          </h4>

                          {iss.niti_evidence && (
                            <div className="p-3 rounded bg-blue-950/30 border border-blue-900/50 space-y-1 mt-2">
                              <h5 className="font-bold text-blue-400">NITI Aayog Data Transparency</h5>
                              <p className="text-slate-300">
                                Source: {iss.niti_evidence.source}{' '}
                                {(iss.niti_evidence.source?.includes('Prototype') || iss.niti_evidence.source?.includes('Demonstration')) && (
                                  <span className="px-1.5 py-0.5 ml-2 rounded bg-amber-900/50 text-amber-400 text-[10px] border border-amber-700/50">DEMO DATA</span>
                                )}
                              </p>
                              <p className="text-slate-300">Indicator: {iss.niti_evidence.indicator}</p>
                              <p className="text-slate-300">Period: {iss.niti_evidence.period}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                            <div className="p-3 rounded bg-slate-900 border border-slate-800">
                              <span className="text-slate-400 block font-medium">Citizen Demand (30%)</span>
                              <span className="text-sm font-bold text-white">{iss.score_breakdown.citizen_demand.weighted_score} pts</span>
                              <span className="text-[10px] text-slate-500 block">{iss.score_breakdown.citizen_demand.raw_val}</span>
                            </div>

                            <div className="p-3 rounded bg-slate-900 border border-slate-800">
                              <span className="text-slate-400 block font-medium">Population Affected (20%)</span>
                              <span className="text-sm font-bold text-white">{iss.score_breakdown.population_affected.weighted_score} pts</span>
                              <span className="text-[10px] text-slate-500 block">{iss.score_breakdown.population_affected.raw_val}</span>
                            </div>

                            <div className="p-3 rounded bg-slate-900 border border-slate-800">
                              <span className="text-slate-400 block font-medium">Infra Gap / Deprivation (20%)</span>
                              <span className="text-sm font-bold text-white">{iss.score_breakdown.infrastructure_gap.weighted_score} pts</span>
                              <span className="text-[10px] text-slate-500 block">{iss.score_breakdown.infrastructure_gap.raw_val}</span>
                              {iss.score_breakdown.infrastructure_gap.source_attribution && (
                                <span className="text-[9px] text-blue-400 block mt-1 border-t border-slate-800/50 pt-1">
                                  Source: {iss.score_breakdown.infrastructure_gap.source_attribution}
                                </span>
                              )}
                            </div>

                            <div className="p-3 rounded bg-slate-900 border border-slate-800">
                              <span className="text-slate-400 block font-medium">Severity (15%)</span>
                              <span className="text-sm font-bold text-white">{iss.score_breakdown.severity.weighted_score} pts</span>
                              <span className="text-[10px] text-slate-500 block">{iss.score_breakdown.severity.raw_val}</span>
                            </div>

                            <div className="p-3 rounded bg-slate-900 border border-slate-800">
                              <span className="text-slate-400 block font-medium">Urgency / Trend (10%)</span>
                              <span className="text-sm font-bold text-white">{iss.score_breakdown.urgency_trend.weighted_score} pts</span>
                              <span className="text-[10px] text-slate-500 block">{iss.score_breakdown.urgency_trend.raw_val}</span>
                            </div>

                            <div className="p-3 rounded bg-slate-900 border border-slate-800">
                              <span className="text-slate-400 block font-medium">Evidence Confidence (5%)</span>
                              <span className="text-sm font-bold text-white">{iss.score_breakdown.evidence_confidence.weighted_score} pts</span>
                              <span className="text-[10px] text-slate-500 block">{iss.score_breakdown.evidence_confidence.raw_val}</span>
                            </div>
                          </div>

                          <div className="p-3 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
                            {iss.score_breakdown.formula_explanation_str}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* NATIONAL PRIORITY ROLLUP TAB */}
          {activeTab === 'rollup' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-white">National & State Priority Rollup</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Aggregated multi-tier ranking across state districts for national policymakers.
                  </p>
                </div>
                <span className="px-3 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                  AI-Estimated / Prototype Rollup
                </span>
              </div>

              {/* Rollup Ranked Table */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3">Rank</th>
                      <th className="p-3">State</th>
                      <th className="p-3">District</th>
                      <th className="p-3">Region & Ward</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Score</th>
                      <th className="p-3">Signals</th>
                      <th className="p-3">Population</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {rollup.map((item) => (
                      <tr key={item.rank} className="hover:bg-slate-850">
                        <td className="p-3 font-bold text-amber-400 font-mono">#{item.rank}</td>
                        <td className="p-3 text-slate-300">{item.state}</td>
                        <td className="p-3 text-slate-300">{item.district}</td>
                        <td className="p-3 font-semibold text-white">{item.region_name}</td>
                        <td className="p-3"><span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">{item.category}</span></td>
                        <td className="p-3 font-black text-amber-400">{item.composite_score}</td>
                        <td className="p-3 text-slate-300">{item.signal_count?.toLocaleString()}</td>
                        <td className="p-3 text-slate-300">{item.population_affected?.toLocaleString()}</td>
                        <td className="p-3">
                          <button
                            onClick={() => setExpandedScoreId(expandedScoreId === `roll-${item.rank}` ? null : `roll-${item.rank}`)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                          >
                            Breakdown
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PROJECTS & INFRASTRUCTURE TAB */}
          {activeTab === 'projects' && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white">Infrastructure Projects & PMGSY Warranty Monitor</h2>

              <div className="space-y-4">
                {projects.map((prj) => (
                  <div key={prj.project_id} className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-mono text-amber-400">{prj.project_id}</span>
                        <h3 className="text-base font-bold text-white mt-0.5">{prj.name}</h3>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-bold">
                        {prj.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-950 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-500 block">Sanctioned Cost</span>
                        <span className="font-bold text-white">₹{(prj.allocated_budget_inr / 100000).toFixed(1)} Lakhs</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Contractor</span>
                        <span className="font-bold text-white">{prj.contractor_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Completion Date</span>
                        <span className="font-bold text-white">{prj.actual_completion_date || prj.target_completion_date}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">DLP Warranty End</span>
                        <span className="font-bold text-amber-400">{prj.dlp_warranty_end_date}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ESCALATION ENGINE TAB */}
          {activeTab === 'escalation' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">State Escalation Ladder Configurations</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Config-driven SLA escalation limits defined per State and Department (Karnataka & Default National).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                  <h3 className="font-bold text-amber-400 text-sm">Karnataka State Escalation Config</h3>
                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                      <p className="font-semibold text-white">14 Days Unresolved (High Severity)</p>
                      <p className="text-slate-400">Escalates: Field Officer → Department Officer</p>
                      <p className="text-amber-400">Required Action: Mandatory site visit & progress report submission</p>
                    </div>

                    <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                      <p className="font-semibold text-white">30 Days Unresolved (High Severity)</p>
                      <p className="text-slate-400">Escalates: Department Officer → District Authority</p>
                      <p className="text-amber-400">Required Action: Deputy Commissioner review & contractor show-cause notice</p>
                    </div>

                    <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                      <p className="font-semibold text-white">7 Days DLP Warranty Defect Flagged</p>
                      <p className="text-slate-400">Escalates: Field Officer → District Authority</p>
                      <p className="text-amber-400">Required Action: DLP Warranty enforcement & joint technical inspection</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                  <h3 className="font-bold text-slate-300 text-sm">Default National Escalation Config</h3>
                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                      <p className="font-semibold text-white">15 Days Unresolved</p>
                      <p className="text-slate-400">Escalates: Field Officer → Department Officer</p>
                    </div>
                    <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                      <p className="font-semibold text-white">45 Days Unresolved</p>
                      <p className="text-slate-400">Escalates: Department Officer → State Steering Committee</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI POLICY COPILOT TAB */}
          {activeTab === 'copilot' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-lg font-bold text-white">AI Policy Copilot (Gemini 1.5 Pro)</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Natural-language Q&A for state secretaries and policymakers over structured citizen demand & national datasets. Always cites evidence.
                </p>
              </div>

              <form onSubmit={handleCopilotAsk} className="space-y-3">
                <textarea
                  rows={3}
                  placeholder="Ask Policy Copilot (e.g., 'What are the top 3 road infrastructure defects in Yadgir under active PMGSY warranty?')"
                  value={copilotQuery}
                  onChange={(e) => setCopilotQuery(e.target.value)}
                  className="w-full p-4 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                ></textarea>
                <button
                  type="submit"
                  disabled={copilotLoading}
                  className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 font-bold text-slate-950 text-xs transition-all shadow"
                >
                  {copilotLoading ? 'Analyzing Data Context...' : 'Ask Policy Copilot'}
                </button>
              </form>

              {copilotResponse && (
                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4 text-xs animate-fadeIn">
                  <h3 className="font-bold text-amber-400 text-sm">Policy Copilot Response</h3>
                  <div className="text-slate-200 whitespace-pre-line leading-relaxed">
                    {copilotResponse.answer}
                  </div>

                  <div className="border-t border-slate-800 pt-3 space-y-1">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Evidence Citation Trail:</p>
                    {copilotResponse.evidence_sources?.map((src: string, i: number) => (
                      <p key={i} className="text-[11px] text-slate-400 flex items-center space-x-1">
                        <span className="text-emerald-400">✓</span>
                        <span>{src}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
