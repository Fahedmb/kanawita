import { CategoryKind, SpendingCategory, Transaction } from './models';
import { roundTND } from './formatTND';

export interface CategoryMetricItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
  totalAmount: number;
  transactionCount: number;
  percentage: number;
}

export interface SoloVsSocialMetric {
  soloSpend: number;
  soloCount: number;
  soloPercentage: number;
  soloAvgPerTx: number;
  socialSpend: number;
  socialCount: number;
  socialPercentage: number;
  socialAvgPerTx: number;
  friendTaxMultiplier: number; // e.g. 1.8x means hangouts cost 1.8x more than solo
}

export interface DayOfWeekMetric {
  dayIndex: number; // 0 = Mon ... 6 = Sun
  shortLabel: string; // 'Mon', 'Tue', ...
  totalAmount: number;
  txCount: number;
  sharePercentage: number;
  isPeakDay: boolean;
}

export interface HeatmapDayCell {
  dateKey: string; // YYYY-MM-DD in local time
  dayNumber: number; // 1..31
  shortDateLabel: string; // e.g. "Oct 11"
  weekdayIndex: number; // 0 = Mon ... 6 = Sun
  amount: number;
  txCount: number;
  isZeroSpend: boolean;
  isToday: boolean;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface SavingsStreakSummary {
  currentZeroSpendStreakDays: number;
  bestZeroSpendStreakDays: number;
  zeroSpendDaysLast28: number;
  activeDaysLast28: number;
}

export interface DashboardMetricsReport {
  includeMonthlyBills: boolean;
  totalSpendDisplayed: number;
  todaySpend: number;
  thisWeekSpend: number;
  last30DaysSpend: number;
  monthlyFixedBillsTotal: number;
  monthlyFixedBillsCount: number;
  dailyAverageBurnRate: number;
  activeSpanDays: number;
  vibeWorthItPct: number;
  vibeRegretCount: number;
  soloVsSocial: SoloVsSocialMetric;
  categoryBreakdown: CategoryMetricItem[];
  dayOfWeekBreakdown: DayOfWeekMetric[];
  savingsStreak: SavingsStreakSummary;
  heatmap28Days: HeatmapDayCell[];
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Formats a timestamp into a local YYYY-MM-DD string.
 */
export const toLocalDateKey = (timestamp: number): string => {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Converts JS Date.getDay() (0=Sun..6=Sat) to Monday-first index (0=Mon..6=Sun).
 */
export const toMondayFirstDayIndex = (timestamp: number): number => {
  const jsDay = new Date(timestamp).getDay();
  return (jsDay + 6) % 7;
};

/**
 * Computes all high-signal metrics for the Kanawita Metrics Dashboard,
 * honoring the 1-tap "Include / Exclude Monthly Fixed Bills" toggle.
 */
export const computeDashboardMetrics = (
  transactions: Transaction[],
  categories: SpendingCategory[],
  options: { includeMonthlyBills: boolean; now?: number }
): DashboardMetricsReport => {
  const { includeMonthlyBills, now = Date.now() } = options;
  const categoryMap = new Map<string, SpendingCategory>(
    categories.map((c) => [c.id, c])
  );

  const allActiveSpendings = transactions.filter(
    (tx) => !tx.deletedAt && tx.type === 'spending' && tx.amount > 0
  );

  // Separate monthly fixed bills so we always know their exact DT weight
  let monthlyFixedBillsTotal = 0;
  let monthlyFixedBillsCount = 0;

  for (const tx of allActiveSpendings) {
    const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
    if (cat?.kind === 'monthly') {
      monthlyFixedBillsTotal = roundTND(monthlyFixedBillsTotal + tx.amount);
      monthlyFixedBillsCount += 1;
    }
  }

  // Apply the 1-tap Monthly Fixed Bills filter
  const filteredSpendings = allActiveSpendings.filter((tx) => {
    if (includeMonthlyBills) return true;
    const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
    return cat?.kind !== 'monthly';
  });

  const todayKey = toLocalDateKey(now);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(
    startOfToday.getFullYear(),
    startOfToday.getMonth(),
    startOfToday.getDate() - 6,
    0,
    0,
    0,
    0
  ).getTime();
  const thirtyDaysAgo = new Date(
    startOfToday.getFullYear(),
    startOfToday.getMonth(),
    startOfToday.getDate() - 29,
    0,
    0,
    0,
    0
  ).getTime();

  let totalSpendDisplayed = 0;
  let todaySpend = 0;
  let thisWeekSpend = 0;
  let last30DaysSpend = 0;
  let earliestTxTimestamp = now;

  let worthItCount = 0;
  let regretCount = 0;

  let soloSpend = 0;
  let soloCount = 0;
  let socialSpend = 0;
  let socialCount = 0;

  const categoryTotals = new Map<string, { amount: number; count: number }>();
  const dayOfWeekTotals = Array.from({ length: 7 }, () => ({
    amount: 0,
    count: 0,
  }));
  const dailySpendByDateKey = new Map<string, { amount: number; count: number }>();

  for (const tx of filteredSpendings) {
    totalSpendDisplayed = roundTND(totalSpendDisplayed + tx.amount);

    const txDateKey = toLocalDateKey(tx.timestamp);
    if (txDateKey === todayKey) {
      todaySpend = roundTND(todaySpend + tx.amount);
    }
    if (tx.timestamp >= sevenDaysAgo && tx.timestamp <= now + 86_400_000) {
      thisWeekSpend = roundTND(thisWeekSpend + tx.amount);
    }
    if (tx.timestamp >= thirtyDaysAgo && tx.timestamp <= now + 86_400_000) {
      last30DaysSpend = roundTND(last30DaysSpend + tx.amount);
    }
    if (tx.timestamp < earliestTxTimestamp) {
      earliestTxTimestamp = tx.timestamp;
    }

    if (tx.vibe === 'worth_it') worthItCount += 1;
    if (tx.vibe === 'regret') regretCount += 1;

    if (tx.friendIds.length === 0) {
      soloSpend = roundTND(soloSpend + tx.amount);
      soloCount += 1;
    } else {
      socialSpend = roundTND(socialSpend + tx.amount);
      socialCount += 1;
    }

    const catId = tx.categoryId ?? 'other';
    const prevCat = categoryTotals.get(catId) ?? { amount: 0, count: 0 };
    categoryTotals.set(catId, {
      amount: roundTND(prevCat.amount + tx.amount),
      count: prevCat.count + 1,
    });

    const dowIdx = toMondayFirstDayIndex(tx.timestamp);
    dayOfWeekTotals[dowIdx].amount = roundTND(
      dayOfWeekTotals[dowIdx].amount + tx.amount
    );
    dayOfWeekTotals[dowIdx].count += 1;

    const prevDay = dailySpendByDateKey.get(txDateKey) ?? {
      amount: 0,
      count: 0,
    };
    dailySpendByDateKey.set(txDateKey, {
      amount: roundTND(prevDay.amount + tx.amount),
      count: prevDay.count + 1,
    });
  }

  // Compute active span in days (between earliest filtered transaction and today, clamped 1..30 for burn rate)
  const earliestDayStart = new Date(earliestTxTimestamp);
  earliestDayStart.setHours(0, 0, 0, 0);
  const rawSpanDays =
    filteredSpendings.length > 0
      ? Math.round(
          (startOfToday.getTime() - earliestDayStart.getTime()) / 86_400_000
        ) + 1
      : 1;
  const activeSpanDays = Math.max(1, Math.min(30, rawSpanDays));
  const dailyAverageBurnRate =
    filteredSpendings.length > 0
      ? roundTND(last30DaysSpend / activeSpanDays)
      : 0;

  // Vibe percentage
  const totalVibeTagged = worthItCount + regretCount;
  const vibeWorthItPct =
    totalVibeTagged > 0 ? Math.round((worthItCount / totalVibeTagged) * 100) : 100;

  // Solo vs Social ("Friend Tax")
  const soloPercentage =
    totalSpendDisplayed > 0
      ? Math.round((soloSpend / totalSpendDisplayed) * 100)
      : 0;
  const socialPercentage =
    totalSpendDisplayed > 0 ? 100 - soloPercentage : 0;
  const soloAvgPerTx = soloCount > 0 ? roundTND(soloSpend / soloCount) : 0;
  const socialAvgPerTx =
    socialCount > 0 ? roundTND(socialSpend / socialCount) : 0;
  const friendTaxMultiplier =
    soloAvgPerTx > 0 && socialAvgPerTx > 0
      ? Math.round((socialAvgPerTx / soloAvgPerTx) * 10) / 10
      : 1;

  const soloVsSocial: SoloVsSocialMetric = {
    soloSpend,
    soloCount,
    soloPercentage,
    soloAvgPerTx,
    socialSpend,
    socialCount,
    socialPercentage,
    socialAvgPerTx,
    friendTaxMultiplier,
  };

  // Category Breakdown
  const categoryBreakdown: CategoryMetricItem[] = Array.from(
    categoryTotals.entries()
  )
    .map(([categoryId, stats]) => {
      const cat = categoryMap.get(categoryId);
      return {
        categoryId,
        name: cat?.name ?? 'Other',
        icon: cat?.icon ?? '📦',
        color: cat?.color ?? '#64748B',
        kind: cat?.kind ?? 'daily',
        totalAmount: stats.amount,
        transactionCount: stats.count,
        percentage:
          totalSpendDisplayed > 0
            ? Math.round((stats.amount / totalSpendDisplayed) * 1000) / 10
            : 0,
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // Day-of-Week Breakdown
  const maxDowAmount = Math.max(...dayOfWeekTotals.map((d) => d.amount), 0);
  const dayOfWeekBreakdown: DayOfWeekMetric[] = dayOfWeekTotals.map(
    (item, idx) => ({
      dayIndex: idx,
      shortLabel: DAY_LABELS[idx],
      totalAmount: item.amount,
      txCount: item.count,
      sharePercentage:
        maxDowAmount > 0 ? Math.round((item.amount / maxDowAmount) * 100) : 0,
      isPeakDay: maxDowAmount > 0 && item.amount === maxDowAmount,
    })
  );

  // 28-Day Activity & Zero-Spend Heatmap (stepping by exact local calendar date)
  const heatmap28Days: HeatmapDayCell[] = [];
  const dailyAmountsForScale: number[] = [];

  for (let offset = 27; offset >= 0; offset--) {
    const dateObj = new Date(
      startOfToday.getFullYear(),
      startOfToday.getMonth(),
      startOfToday.getDate() - offset,
      12,
      0,
      0,
      0
    );
    const dateKey = toLocalDateKey(dateObj.getTime());
    const entry = dailySpendByDateKey.get(dateKey);
    if (entry && entry.amount > 0) {
      dailyAmountsForScale.push(entry.amount);
    }
  }

  const maxDailySpend = Math.max(...dailyAmountsForScale, 1);

  let currentZeroSpendStreakDays = 0;
  let bestZeroSpendStreakDays = 0;
  let runningStreak = 0;
  let zeroSpendDaysLast28 = 0;
  let activeDaysLast28 = 0;

  for (let offset = 27; offset >= 0; offset--) {
    const dateObj = new Date(
      startOfToday.getFullYear(),
      startOfToday.getMonth(),
      startOfToday.getDate() - offset,
      12,
      0,
      0,
      0
    );
    const dayTs = dateObj.getTime();
    const dateKey = toLocalDateKey(dayTs);
    const entry = dailySpendByDateKey.get(dateKey) ?? { amount: 0, count: 0 };
    const isZeroSpend = entry.amount === 0;
    const isToday = offset === 0;

    if (isZeroSpend) {
      zeroSpendDaysLast28 += 1;
      runningStreak += 1;
      if (runningStreak > bestZeroSpendStreakDays) {
        bestZeroSpendStreakDays = runningStreak;
      }
    } else {
      activeDaysLast28 += 1;
      runningStreak = 0;
    }

    let intensity: 0 | 1 | 2 | 3 | 4 = 0;
    if (entry.amount > 0) {
      const ratio = entry.amount / maxDailySpend;
      if (ratio <= 0.25) intensity = 1;
      else if (ratio <= 0.5) intensity = 2;
      else if (ratio <= 0.75) intensity = 3;
      else intensity = 4;
    }

    const shortDateLabel = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    heatmap28Days.push({
      dateKey,
      dayNumber: dateObj.getDate(),
      shortDateLabel,
      weekdayIndex: toMondayFirstDayIndex(dayTs),
      amount: entry.amount,
      txCount: entry.count,
      isZeroSpend,
      isToday,
      intensity,
    });
  }

  // Current streak is the streak at the end of the 28-day window
  currentZeroSpendStreakDays = runningStreak;

  return {
    includeMonthlyBills,
    totalSpendDisplayed,
    todaySpend,
    thisWeekSpend,
    last30DaysSpend,
    monthlyFixedBillsTotal,
    monthlyFixedBillsCount,
    dailyAverageBurnRate,
    activeSpanDays,
    vibeWorthItPct,
    vibeRegretCount: regretCount,
    soloVsSocial,
    categoryBreakdown,
    dayOfWeekBreakdown,
    savingsStreak: {
      currentZeroSpendStreakDays,
      bestZeroSpendStreakDays,
      zeroSpendDaysLast28,
      activeDaysLast28,
    },
    heatmap28Days,
  };
};
