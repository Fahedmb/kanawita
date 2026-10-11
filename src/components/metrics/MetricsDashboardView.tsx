'use client';

import React, { useState } from 'react';
import {
  Flame,
  CalendarDays,
  PieChart,
  Users,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { formatTND } from '@/domain/formatTND';
import {
  DashboardMetricsReport,
  HeatmapDayCell,
} from '@/domain/metricsEngine';

interface MetricsDashboardViewProps {
  metrics: DashboardMetricsReport;
  onToggleMonthlyBills: (nextInclude: boolean) => void;
}

const getHeatmapCellColor = (cell: HeatmapDayCell): string => {
  if (cell.isZeroSpend) {
    return 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300';
  }
  switch (cell.intensity) {
    case 1:
      return 'bg-amber-500/15 border-amber-500/30 text-amber-200';
    case 2:
      return 'bg-amber-500/30 border-amber-500/50 text-amber-100';
    case 3:
      return 'bg-orange-500/40 border-orange-500/60 text-white';
    case 4:
      return 'bg-rose-500/50 border-rose-400 text-white';
    default:
      return 'bg-white/[0.04] border-white/[0.08] text-zinc-400';
  }
};

export const MetricsDashboardView: React.FC<MetricsDashboardViewProps> = ({
  metrics,
  onToggleMonthlyBills,
}) => {
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const selectedDay: HeatmapDayCell | null =
    (selectedDateKey
      ? metrics.heatmap28Days.find((c) => c.dateKey === selectedDateKey)
      : undefined) ??
    metrics.heatmap28Days[metrics.heatmap28Days.length - 1] ??
    null;

  return (
    <div className="space-y-4">
      {/* 1-Tap Monthly Fixed Bills Filter Toggle Card */}
      <div className="rounded-2xl bg-gradient-to-r from-[#131825] to-[#0E121B] border border-white/[0.09] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <h2 className="text-xs font-bold text-white">
                Monthly Fixed Bills Filter (Rent, Bills &amp; Internet, Gym)
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {metrics.includeMonthlyBills ? (
                <span>
                  Currently <strong className="text-amber-300">including</strong>{' '}
                  <span className="font-mono tabular-nums">
                    {formatTND(metrics.monthlyFixedBillsTotal)}
                  </span>{' '}
                  of monthly fixed bills in averages.
                </span>
              ) : (
                <span>
                  Excluding{' '}
                  <strong className="text-emerald-300 font-mono tabular-nums">
                    {formatTND(metrics.monthlyFixedBillsTotal)}
                  </strong>{' '}
                  ({metrics.monthlyFixedBillsCount} fixed bills) so daily burn
                  stays 100% accurate.
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={metrics.includeMonthlyBills}
            data-testid="toggle-monthly-bills"
            onClick={() => onToggleMonthlyBills(!metrics.includeMonthlyBills)}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold border transition-all active:scale-[0.96] ${
              metrics.includeMonthlyBills
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
          >
            {metrics.includeMonthlyBills
              ? 'Included (Tap to Exclude)'
              : 'Excluded ✓ (Daily Pure)'}
          </button>
        </div>
      </div>

      {/* 4 High-Signal KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-3">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
            Daily Burn Rate
          </span>
          <span
            data-testid="metric-daily-burn"
            className="mt-1 block font-mono text-lg font-bold text-emerald-400 tabular-nums"
          >
            {formatTND(metrics.dailyAverageBurnRate)}
            <span className="text-[10px] text-zinc-400 font-normal">/day</span>
          </span>
          <span className="text-[10px] text-zinc-500">
            Across {metrics.activeSpanDays}d window
          </span>
        </div>

        <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-3">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
            Spent Today / 7d
          </span>
          <span className="mt-1 block font-mono text-lg font-bold text-white tabular-nums">
            {formatTND(metrics.todaySpend)}
          </span>
          <span className="text-[10px] text-zinc-400 font-mono tabular-nums">
            7d: {formatTND(metrics.thisWeekSpend)}
          </span>
        </div>

        <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-3">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
            Zero-Spend Streak
          </span>
          <span className="mt-1 block font-mono text-lg font-bold text-emerald-300 tabular-nums">
            {metrics.savingsStreak.currentZeroSpendStreakDays}d{' '}
            <span className="text-xs font-normal text-zinc-400">
              (Best: {metrics.savingsStreak.bestZeroSpendStreakDays}d)
            </span>
          </span>
          <span className="text-[10px] text-zinc-400">
            {metrics.savingsStreak.zeroSpendDaysLast28}/28 zero-spend days
          </span>
        </div>

        <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-3">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
            Worth-It Vibe Score
          </span>
          <span className="mt-1 block font-mono text-lg font-bold text-amber-300 tabular-nums">
            {metrics.vibeWorthItPct}%
          </span>
          <span className="text-[10px] text-zinc-400">
            {metrics.vibeRegretCount} regret spend
            {metrics.vibeRegretCount === 1 ? '' : 's'} flagged
          </span>
        </div>
      </div>

      {/* Solo vs Social ("Friend Tax") Ratio Card */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Solo vs. Social (&ldquo;Friend Tax&rdquo; Ratio)
            </h3>
          </div>
          <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber-300 tabular-nums">
            {metrics.soloVsSocial.friendTaxMultiplier}x Social Multiplier
          </span>
        </div>

        {/* Split Bar */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-[#090B10] flex border border-white/[0.06]">
          <div
            style={{ width: `${metrics.soloVsSocial.soloPercentage}%` }}
            className="bg-emerald-500 transition-all duration-300"
            title={`Solo: ${metrics.soloVsSocial.soloPercentage}%`}
          />
          <div
            style={{ width: `${metrics.soloVsSocial.socialPercentage}%` }}
            className="bg-amber-400 transition-all duration-300"
            title={`With Friends: ${metrics.soloVsSocial.socialPercentage}%`}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-xl bg-[#090B10] border border-white/[0.05] p-2.5">
            <div className="flex items-center justify-between text-zinc-400">
              <span>🧍 Solo Spend</span>
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                {metrics.soloVsSocial.soloPercentage}%
              </span>
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-white tabular-nums">
              {formatTND(metrics.soloVsSocial.soloSpend)}
            </div>
            <div className="text-[10px] text-zinc-400 font-mono tabular-nums">
              Avg: {formatTND(metrics.soloVsSocial.soloAvgPerTx)} / outing (
              {metrics.soloVsSocial.soloCount})
            </div>
          </div>

          <div className="rounded-xl bg-[#090B10] border border-white/[0.05] p-2.5">
            <div className="flex items-center justify-between text-zinc-400">
              <span>👥 With Friends</span>
              <span className="font-mono font-bold text-amber-300 tabular-nums">
                {metrics.soloVsSocial.socialPercentage}%
              </span>
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-white tabular-nums">
              {formatTND(metrics.soloVsSocial.socialSpend)}
            </div>
            <div className="text-[10px] text-zinc-400 font-mono tabular-nums">
              Avg: {formatTND(metrics.soloVsSocial.socialAvgPerTx)} / hangout (
              {metrics.soloVsSocial.socialCount})
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown (DT & %) */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Category Breakdown (DT &amp; %)
            </h3>
          </div>
          <span className="font-mono text-xs font-bold text-zinc-300 tabular-nums">
            Total: {formatTND(metrics.totalSpendDisplayed)}
          </span>
        </div>

        {metrics.categoryBreakdown.length === 0 ? (
          <p className="text-xs text-zinc-400 py-4 text-center">
            No category spendings for current filter.
          </p>
        ) : (
          <div className="space-y-2.5">
            {metrics.categoryBreakdown.map((cat) => (
              <div key={cat.categoryId} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{cat.icon}</span>
                    <span className="font-semibold text-white">{cat.name}</span>
                    <span className="text-[10px] text-zinc-400 font-mono tabular-nums">
                      ({cat.transactionCount})
                    </span>
                    {cat.kind === 'monthly' && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.2 text-[9px] font-semibold text-amber-300">
                        Monthly
                      </span>
                    )}
                  </div>
                  <div className="font-mono tabular-nums text-right">
                    <span className="font-bold text-white">
                      {formatTND(cat.totalAmount)}
                    </span>{' '}
                    <span className="text-[11px] text-zinc-400">
                      ({cat.percentage}%)
                    </span>
                  </div>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-[#090B10]">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(3, cat.percentage)}%`,
                      backgroundColor: cat.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Day-of-Week Spending Chart */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Day-of-Week Spending Rhythm
            </h3>
          </div>
          <span className="text-[10px] text-zinc-400">Peak day highlighted</span>
        </div>

        <div className="grid grid-cols-7 gap-2 pt-2">
          {metrics.dayOfWeekBreakdown.map((day) => (
            <div
              key={day.dayIndex}
              className="flex flex-col items-center justify-end"
            >
              <span className="font-mono text-[10px] text-zinc-400 tabular-nums mb-1">
                {day.totalAmount > 0
                  ? formatTND(day.totalAmount, { showSuffix: false })
                  : '0'}
              </span>
              <div className="flex h-24 w-full items-end justify-center rounded-xl bg-[#090B10] p-1 border border-white/[0.04]">
                <div
                  className={`w-full rounded-lg transition-all duration-300 ${
                    day.isPeakDay
                      ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                      : day.totalAmount > 0
                        ? 'bg-emerald-500/60'
                        : 'bg-white/[0.05]'
                  }`}
                  style={{
                    height: `${
                      day.totalAmount > 0
                        ? Math.max(12, day.sharePercentage)
                        : 6
                    }%`,
                  }}
                />
              </div>
              <span
                className={`mt-1.5 text-[11px] font-semibold ${
                  day.isPeakDay ? 'text-amber-300' : 'text-zinc-400'
                }`}
              >
                {day.shortLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 28-Day Activity & Zero-Spend Day Heatmap */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              28-Day Activity &amp; Zero-Spend Heatmap
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Green = 0 DT Zero-Spend Day</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {metrics.heatmap28Days.map((cell) => {
            const isSelected = selectedDay?.dateKey === cell.dateKey;
            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => setSelectedDateKey(cell.dateKey)}
                className={`flex flex-col items-center justify-center rounded-xl border py-2 px-1 transition-all active:scale-[0.95] ${getHeatmapCellColor(
                  cell
                )} ${isSelected ? 'ring-2 ring-white' : ''}`}
              >
                <span className="text-[9px] opacity-75">
                  {cell.shortDateLabel.split(' ')[0]}
                </span>
                <span className="font-mono text-xs font-bold tabular-nums">
                  {cell.dayNumber}
                </span>
                <span className="font-mono text-[9px] tabular-nums mt-0.5">
                  {cell.isZeroSpend
                    ? '0 DT'
                    : `${formatTND(cell.amount, { showSuffix: false })}`}
                </span>
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <div className="flex items-center justify-between rounded-xl bg-[#090B10] border border-white/[0.06] px-3 py-2 text-xs">
            <div>
              <span className="font-semibold text-white">
                {selectedDay.shortDateLabel}
                {selectedDay.isToday ? ' (Today)' : ''}
              </span>
              <span className="ml-2 text-zinc-400">
                {selectedDay.isZeroSpend
                  ? '🟢 Clean Zero-Spend Day!'
                  : `${selectedDay.txCount} transaction${selectedDay.txCount === 1 ? '' : 's'}`}
              </span>
            </div>
            <span className="font-mono font-bold text-emerald-400 tabular-nums">
              {formatTND(selectedDay.amount)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
