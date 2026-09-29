import './globals.css';
import React from 'react';

export const metadata = {
  title: 'JanSetu AI — Public Development Transparency Portal',
  description: 'National Digital Public Infrastructure aggregating citizen development requests, monitoring project execution, and tracking public infrastructure accountability.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-amber-500 selection:text-slate-950 font-sans">
        {/* National Top Ribbon */}
        <div className="w-full bg-gradient-to-r from-orange-600 via-white to-emerald-600 h-1 sticky top-0 z-50"></div>

        <header className="bg-slate-900/90 border-b border-slate-800 text-white sticky top-1 z-40 shadow-md backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <a href="/" className="flex items-center space-x-3 group">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center font-extrabold text-slate-950 text-xl shadow-lg transition-transform group-hover:scale-105">
                  JS
                </div>
                <div>
                  <span className="font-extrabold text-lg tracking-tight text-white">JanSetu <span className="text-amber-500">AI</span></span>
                  <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                    Citizen DPI
                  </span>
                </div>
              </a>
            </div>

            <nav className="flex items-center space-x-4 sm:space-x-6 text-xs sm:text-sm font-semibold text-slate-300">
              <a href="/" className="hover:text-amber-400 transition-colors">Overview</a>
              <a href="/#map" className="hover:text-amber-400 transition-colors hidden sm:inline">Hotspot Map</a>
              <a href="/#scorecard" className="hover:text-amber-400 transition-colors hidden sm:inline">Public Scorecard</a>
              <a href="/track" className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold transition-all shadow-md">
                Track Request &rarr;
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1">
          {children}
        </main>

        <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-bold text-slate-200">JanSetu AI &copy; 2026 &middot; Citizen Development Intelligence Platform</p>
              <p className="mt-1 text-slate-400">
                Digital Public Infrastructure for Government Adoption under Sovereign Licensing Architecture.
              </p>
            </div>
            <div className="flex items-center space-x-3 text-slate-400 text-[11px]">
              <span>🔒 Data Privacy Guard</span>
              <span>•</span>
              <span>⚡ Gemini Multimodal</span>
              <span>•</span>
              <span>🏛️ NITI & PMGSY Verified</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
