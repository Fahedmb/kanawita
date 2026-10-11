import {
  Friend,
  InfluenceLevel,
  SpendingCategory,
  Transaction,
} from './models';
import { roundTND } from './formatTND';

export interface FriendTopCategory {
  categoryId: string;
  name: string;
  icon: string;
  totalSpent: number;
}

export interface FriendInfluenceMetric {
  friend: Friend;
  totalSpent: number;
  hangoutCount: number;
  cph: number; // Average Cost Per Hangout in TND
  ratioToBaseline: number; // CPH_f / CPH_median
  autoInfluence: InfluenceLevel;
  effectiveInfluence: InfluenceLevel;
  isManualOverride: boolean;
  topCategory: FriendTopCategory | null;
  worthItCount: number;
  regretCount: number;
  lastHangoutAt: number | null;
}

export interface FriendDuoMetric {
  pairKey: string;
  friendA: Friend;
  friendB: Friend;
  jointSpend: number;
  jointHangoutCount: number;
  jointCph: number;
  ratioToBaseline: number;
  isSpikeDuo: boolean; // True when jointCph > 1.2 * medianCph
}

export interface InfluenceEngineReport {
  medianSocialCph: number;
  averageSoloSpend: number;
  totalSocialSpend: number;
  totalSocialHangouts: number;
  friendsMetrics: FriendInfluenceMetric[];
  comboDuos: FriendDuoMetric[];
}

/**
 * Computes the median of a numeric array. Returns 0 for an empty array.
 */
export const computeMedian = (values: number[]): number => {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return roundTND(valid[mid]);
  }
  return roundTND((valid[mid - 1] + valid[mid]) / 2);
};

/**
 * Classifies a friend's ratio R_f = CPH_f / CPH_median according to ARCHITECTURE.md §5:
 * - Good Influence (🟢): R_f <= 0.90
 * - Neutral (🟡): 0.90 < R_f <= 1.20
 * - Bad Influence (🔴): R_f > 1.20
 */
export const classifyInfluenceRatio = (
  ratio: number,
  hangoutCount: number
): InfluenceLevel => {
  if (hangoutCount <= 0 || !Number.isFinite(ratio) || ratio <= 0) {
    return 'neutral';
  }
  if (ratio <= 0.9) return 'good';
  if (ratio <= 1.2) return 'neutral';
  return 'bad';
};

/**
 * Cycles manual override on a friend badge in 1 tap:
 * Auto (null) -> Good ('good') -> Bad ('bad') -> Neutral ('neutral') -> Auto (null)
 */
export const cycleManualOverride = (
  current: InfluenceLevel | null | undefined
): InfluenceLevel | null => {
  if (!current) return 'good';
  if (current === 'good') return 'bad';
  if (current === 'bad') return 'neutral';
  return null;
};

/**
 * Runs the Hybrid Friend Influence Engine across all friends and transactions.
 * Excludes monthly fixed bills (Rent, Bills & Internet, Gym) from hangout baseline
 * as specified in ARCHITECTURE.md §5.
 */
export const computeFriendInfluence = (
  friends: Friend[],
  transactions: Transaction[],
  categories: SpendingCategory[]
): InfluenceEngineReport => {
  const categoryMap = new Map<string, SpendingCategory>(
    categories.map((c) => [c.id, c])
  );

  // Filter active daily spendings (excluding Monthly Fixed bills like Rent)
  const validSpendings = transactions.filter((tx) => {
    if (tx.deletedAt || tx.type !== 'spending' || tx.amount <= 0) return false;
    const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
    if (cat?.kind === 'monthly') return false;
    return true;
  });

  // Compute Solo vs Social aggregates
  const soloTxs = validSpendings.filter((tx) => tx.friendIds.length === 0);
  const socialTxs = validSpendings.filter((tx) => tx.friendIds.length > 0);

  const totalSoloSpend = soloTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const averageSoloSpend =
    soloTxs.length > 0 ? roundTND(totalSoloSpend / soloTxs.length) : 0;

  const totalSocialSpend = roundTND(
    socialTxs.reduce((sum, tx) => sum + tx.amount, 0)
  );
  const totalSocialHangouts = socialTxs.length;

  // First pass: gather raw totals and CPH per friend
  const rawPerFriend = friends.map((friend) => {
    const tagged = validSpendings.filter((tx) =>
      tx.friendIds.includes(friend.id)
    );
    const totalSpent = roundTND(
      tagged.reduce((sum, tx) => sum + tx.amount, 0)
    );
    const hangoutCount = tagged.length;
    const cph = hangoutCount > 0 ? roundTND(totalSpent / hangoutCount) : 0;

    // Top Category for this friend
    const catTotals = new Map<string, number>();
    let worthItCount = 0;
    let regretCount = 0;
    let lastHangoutAt: number | null = null;

    for (const tx of tagged) {
      if (tx.categoryId) {
        catTotals.set(
          tx.categoryId,
          roundTND((catTotals.get(tx.categoryId) ?? 0) + tx.amount)
        );
      }
      if (tx.vibe === 'worth_it') worthItCount += 1;
      if (tx.vibe === 'regret') regretCount += 1;
      if (lastHangoutAt === null || tx.timestamp > lastHangoutAt) {
        lastHangoutAt = tx.timestamp;
      }
    }

    let topCategory: FriendTopCategory | null = null;
    for (const [catId, amount] of Array.from(catTotals.entries())) {
      if (!topCategory || amount > topCategory.totalSpent) {
        const catObj = categoryMap.get(catId);
        topCategory = {
          categoryId: catId,
          name: catObj?.name ?? 'Other',
          icon: catObj?.icon ?? '📦',
          totalSpent: amount,
        };
      }
    }

    return {
      friend,
      totalSpent,
      hangoutCount,
      cph,
      topCategory,
      worthItCount,
      regretCount,
      lastHangoutAt,
    };
  });

  // Median CPH across active friends (fallback to averageSoloSpend if only 1 friend has hangouts)
  const activeFriendCphs = rawPerFriend
    .filter((item) => item.hangoutCount > 0)
    .map((item) => item.cph);

  const medianSocialCph =
    activeFriendCphs.length >= 2
      ? computeMedian(activeFriendCphs)
      : activeFriendCphs.length === 1 && averageSoloSpend > 0
        ? averageSoloSpend
        : computeMedian(activeFriendCphs);

  // Second pass: classify each friend against medianSocialCph
  const friendsMetrics: FriendInfluenceMetric[] = rawPerFriend
    .map((item) => {
      const ratioToBaseline =
        medianSocialCph > 0 && item.hangoutCount > 0
          ? Math.round((item.cph / medianSocialCph) * 100) / 100
          : item.hangoutCount > 0
            ? 1
            : 0;

      const autoInfluence = classifyInfluenceRatio(
        ratioToBaseline,
        item.hangoutCount
      );

      const isManualOverride = Boolean(item.friend.manualOverride);
      const effectiveInfluence: InfluenceLevel =
        item.friend.manualOverride ?? autoInfluence;

      return {
        ...item,
        ratioToBaseline,
        autoInfluence,
        effectiveInfluence,
        isManualOverride,
      };
    })
    .sort((a, b) => {
      if (b.totalSpent !== a.totalSpent) return b.totalSpent - a.totalSpent;
      return a.friend.name.localeCompare(b.friend.name);
    });

  // Third pass: Combo Duos (when 2+ friends together spike spending)
  const friendById = new Map<string, Friend>(friends.map((f) => [f.id, f]));
  const duoMap = new Map<
    string,
    { friendA: Friend; friendB: Friend; jointSpend: number; jointHangoutCount: number }
  >();

  for (const tx of validSpendings) {
    const validIds = Array.from(new Set(tx.friendIds))
      .filter((id) => friendById.has(id))
      .sort();
    if (validIds.length < 2) continue;

    for (let i = 0; i < validIds.length; i++) {
      for (let j = i + 1; j < validIds.length; j++) {
        const idA = validIds[i];
        const idB = validIds[j];
        const pairKey = `${idA}__${idB}`;
        const existing = duoMap.get(pairKey);
        if (existing) {
          existing.jointSpend = roundTND(existing.jointSpend + tx.amount);
          existing.jointHangoutCount += 1;
        } else {
          duoMap.set(pairKey, {
            friendA: friendById.get(idA)!,
            friendB: friendById.get(idB)!,
            jointSpend: roundTND(tx.amount),
            jointHangoutCount: 1,
          });
        }
      }
    }
  }

  const baselineForDuos = medianSocialCph > 0 ? medianSocialCph : averageSoloSpend;

  const comboDuos: FriendDuoMetric[] = Array.from(duoMap.entries())
    .map(([pairKey, data]) => {
      const jointCph = roundTND(data.jointSpend / data.jointHangoutCount);
      const ratioToBaseline =
        baselineForDuos > 0
          ? Math.round((jointCph / baselineForDuos) * 100) / 100
          : 1;
      return {
        pairKey,
        friendA: data.friendA,
        friendB: data.friendB,
        jointSpend: data.jointSpend,
        jointHangoutCount: data.jointHangoutCount,
        jointCph,
        ratioToBaseline,
        isSpikeDuo: ratioToBaseline > 1.2,
      };
    })
    .sort((a, b) => b.jointCph - a.jointCph);

  return {
    medianSocialCph,
    averageSoloSpend,
    totalSocialSpend,
    totalSocialHangouts,
    friendsMetrics,
    comboDuos,
  };
};
