import './globals.css';
import React from 'react';

export const metadata = {
  title: 'JanSetu AI — Government Authority & Policy Platform',
  description: 'Role-gated executive platform for field officers, department nodal officers, district magistrates, state secretaries, and national policymakers.',
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
        <div className="w-full bg-gradient-to-r from-orange-600 via-white to-emerald-600 h-1 sticky top-0 z-50"></div>
        {children}
      </body>
    </html>
  );
}
