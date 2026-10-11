import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#08090C] p-6 text-center text-white">
      <div className="max-w-sm rounded-2xl bg-[#10131C] border border-white/[0.08] p-6 space-y-3">
        <h2 className="text-base font-bold text-emerald-400">
          Page Not Found
        </h2>
        <p className="text-xs text-zinc-400">
          Return to the Kanawita Speed-Pad logger.
        </p>
        <Link
          href="/"
          className="inline-block w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950"
        >
          Back to Kanawita
        </Link>
      </div>
    </div>
  );
}
