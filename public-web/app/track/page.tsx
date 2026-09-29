'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface TrackResponse {
  reference_number: string;
  category: string;
  severity: string;
  potential_impact: string;
  generalized_location: string;
  status: string;
  created_at: string;
  status_timeline: Array<{ step: string; completed: boolean; timestamp?: string }>;
  evidence?: { has_voice?: boolean; has_text?: boolean; has_image?: boolean };
  evidence_types?: { voice?: boolean; text?: boolean; image?: boolean };
  ai_analysis?: { voice_processed?: boolean; detected_language?: string };
}

const languageMap: Record<string, string> = {
  en: 'English', kn: 'Kannada', hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
  mr: 'Marathi', bn: 'Bengali', ml: 'Malayalam', gu: 'Gujarati', pa: 'Punjabi'
};

export default function TrackPage() {
  const searchParams = useSearchParams();
  const initialRef = searchParams.get('ref') || '';

  const [refCode, setRefCode] = useState(initialRef);
  const [data, setData] = useState<TrackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);

    fetch(`http://localhost:5000/api/signals/track/${encodeURIComponent(code.trim())}`)
      .then((res) => {
        if (!res.ok) throw new Error(`No request found for reference '${code}'.`);
        return res.json();
      })
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setData(null);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (initialRef) {
      fetchStatus(initialRef);
    }
  }, [initialRef]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStatus(refCode);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold text-slate-900">Track Citizen Request</h1>
        <p className="text-slate-600 text-sm max-w-lg mx-auto">
          Enter your unique reference code (e.g., JS-2026-00101) received on WhatsApp to view live accountability and status updates.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3 max-w-md mx-auto">
        <input
          type="text"
          placeholder="JS-2026-XXXXXX"
          value={refCode}
          onChange={(e) => setRefCode(e.target.value)}
          className="flex-1 px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-900 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-amber-500 hover:bg-amber-600 font-bold text-slate-950 rounded-lg text-sm transition-all shadow-sm"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm text-center max-w-md mx-auto">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {data.ai_analysis?.voice_processed && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm flex flex-col gap-1">
              <p className="font-bold flex items-center gap-2">🎤 Voice report received</p>
              <p>Language: {data.ai_analysis.detected_language ? languageMap[data.ai_analysis.detected_language] || data.ai_analysis.detected_language : 'Unknown'}</p>
              <p>AI analysis completed</p>
            </div>
          )}
          
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-6 gap-4">
              <div>
                <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">Reference Code</span>
                <h2 className="text-2xl font-extrabold font-mono text-slate-900">{data.reference_number}</h2>
                <p className="text-xs text-slate-500 mt-1">Logged on {new Date(data.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                  {data.status}
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold">
                  {data.category}
                </span>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 font-medium">Severity</span>
                <p className="font-bold text-slate-900 mt-0.5">{data.severity}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Potential Impact</span>
                <p className="font-bold text-slate-900 mt-0.5">{data.potential_impact}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Generalized Location</span>
                <p className="font-bold text-slate-900 mt-0.5">{data.generalized_location}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Evidence</span>
                <div className="font-bold text-slate-900 mt-0.5 flex flex-wrap gap-1">
                  {(data.evidence?.has_voice || data.evidence_types?.voice) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px]">
                      🎤 Voice {data.ai_analysis?.detected_language ? `(${languageMap[data.ai_analysis.detected_language] || data.ai_analysis.detected_language})` : ''}
                    </span>
                  )}
                  {(!data.evidence?.has_voice && !data.evidence_types?.voice) && (
                    <span className="text-slate-400 font-normal">Standard</span>
                  )}
                </div>
              </div>
            </div>

            {/* Accountability Timeline */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Accountability Timeline</h3>
            <div className="relative pl-6 space-y-6 border-l-2 border-slate-200">
              {data.status_timeline.map((step, idx) => (
                <div key={idx} className="relative">
                  <div
                    className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full border-2 bg-white ${
                      step.completed ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                    }`}
                  ></div>
                  <div className="space-y-0.5">
                    <p className={`text-sm font-bold ${step.completed ? 'text-slate-900' : 'text-slate-400'}`}>
                      {step.step}
                    </p>
                    <p className="text-xs text-slate-500">
                      {step.completed ? 'Completed' : 'Pending Review'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
            🔒 Privacy Protection Active: Precise citizen GPS coordinates are generalized to locality level to safeguard citizen identity.
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
