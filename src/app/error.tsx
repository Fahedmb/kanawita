'use client';

import React from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#08090C] p-6 text-center text-white">
      <div className="max-w-sm rounded-2xl bg-[#10131C] border border-white/[0.08] p-6 space-y-3">
        <h2 className="text-base font-bold text-rose-400">
          Something went wrong in Kanawita
        </h2>
        <p className="text-xs text-zinc-400">
          {error.message || 'Your local phone data in IndexedDB remains safe.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 active:scale-[0.97]"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
