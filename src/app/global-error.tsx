'use client';

import React from 'react';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-dvh items-center justify-center bg-[#08090C] p-6 text-white">
        <div className="max-w-sm rounded-2xl bg-[#10131C] border border-white/[0.08] p-6 text-center space-y-3">
          <h2 className="text-base font-bold text-rose-400">
            Kanawita Recovery Mode
          </h2>
          <p className="text-xs text-zinc-400">
            Your offline IndexedDB data is intact on your phone.
          </p>
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950"
          >
            Reload App
          </button>
        </div>
      </body>
    </html>
  );
}
