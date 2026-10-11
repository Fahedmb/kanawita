import { describe, expect, it } from 'vitest';
import {
  addQuickAmount,
  appendKeypadKey,
  backspaceKeypad,
  formatTND,
  parseKeypadAmount,
  roundTND,
} from './formatTND';
import { computeUnifiedBalance } from './balanceEngine';
import {
  classifyInfluenceRatio,
  computeFriendInfluence,
  computeMedian,
  cycleManualOverride,
} from './influenceEngine';
import { computeDashboardMetrics } from './metricsEngine';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_FRIENDS,
  DEFAULT_VAULTS,
  Transaction,
} from './models';

describe('formatTND & Speed-Pad Keypad Engine', () => {
  it('formats TND amounts without forcing trailing zeros', () => {
    expect(formatTND(4.5)).toBe('4.5 DT');
    expect(formatTND(0.2)).toBe('0.2 DT');
    expect(formatTND(12)).toBe('12 DT');
    expect(formatTND(1450.75)).toBe('1,450.75 DT');
    expect(formatTND(1.255)).toBe('1.255 DT');
    expect(formatTND(0)).toBe('0 DT');
  });

  it('eliminates IEEE-754 floating point noise', () => {
    expect(roundTND(0.1 + 0.2)).toBe(0.3);
    expect(formatTND(4.500000000000001)).toBe('4.5 DT');
  });

  it('handles negative numbers and non-finite inputs safely', () => {
    expect(formatTND(-15.5)).toBe('-15.5 DT');
    expect(formatTND(Number.NaN)).toBe('0 DT');
    expect(formatTND(Number.POSITIVE_INFINITY)).toBe('0 DT');
  });

  it('builds keypad strings with decimal, millime limit, and max cap', () => {
    let val = '0';
    val = appendKeypadKey(val, '4');
    expect(val).toBe('4');
    val = appendKeypadKey(val, '.');
    expect(val).toBe('4.');
    val = appendKeypadKey(val, '.'); // duplicate decimal ignored
    expect(val).toBe('4.');
    val = appendKeypadKey(val, '5');
    expect(val).toBe('4.5');
    expect(parseKeypadAmount(val)).toBe(4.5);

    // Millime precision cap (3 decimals)
    let millimes = '0.255';
    millimes = appendKeypadKey(millimes, '9');
    expect(millimes).toBe('0.255');

    // Backspace behavior
    expect(backspaceKeypad('4.5')).toBe('4.');
    expect(backspaceKeypad('4')).toBe('0');
    expect(backspaceKeypad('0')).toBe('0');

    // Quick amount chips (+1, +5, +10 DT)
    expect(addQuickAmount('4.5', 5)).toBe('9.5');
    expect(addQuickAmount('0', 10)).toBe('10');
  });
});

describe('Unified Balance Pool Engine', () => {
  it('sums the 3 reference vaults and subtracts only active offset spendings', () => {
    const txs: Transaction[] = [
      {
        id: 't1',
        type: 'spending',
        amount: 4.5,
        categoryId: 'coffee',
        friendIds: [],
        countInBalanceOffset: true,
        timestamp: 1000,
        updatedAt: 1000,
      },
      {
        id: 't2',
        type: 'spending',
        amount: 15.3,
        categoryId: 'food',
        friendIds: [],
        countInBalanceOffset: true,
        timestamp: 2000,
        updatedAt: 2000,
      },
      {
        id: 't_deleted',
        type: 'spending',
        amount: 100,
        categoryId: 'clothes',
        friendIds: [],
        countInBalanceOffset: true,
        timestamp: 3000,
        updatedAt: 3000,
        deletedAt: 3500,
      },
      {
        id: 't_synced_before',
        type: 'spending',
        amount: 650,
        categoryId: 'rent',
        friendIds: [],
        countInBalanceOffset: false,
        timestamp: 500,
        updatedAt: 500,
      },
    ];

    const summary = computeUnifiedBalance(DEFAULT_VAULTS, txs);
    // DEFAULT_VAULTS: 1450 + 2800 + 320.5 = 4570.5 DT
    expect(summary.grossVaultsTotal).toBe(4570.5);
    expect(summary.activeSpendingOffset).toBe(19.8);
    expect(summary.activeOffsetCount).toBe(2);
    expect(summary.remainingTotalMoney).toBe(4550.7);
    expect(summary.totalHistoricalSpend).toBe(669.8);
    expect(summary.vaultBreakdown).toHaveLength(3);
  });
});

describe('Hybrid Friend Influence Engine', () => {
  it('computes CPH, classifies Good/Neutral/Bad relative to median, excludes monthly fixed bills, and detects Combo Duos', () => {
    const txs: Transaction[] = [
      // Amine: 2 cheap coffee hangouts (5 DT, 5 DT -> CPH = 5 DT)
      {
        id: 'tx1',
        type: 'spending',
        amount: 5,
        categoryId: 'coffee',
        friendIds: ['friend_amine'],
        vibe: 'worth_it',
        countInBalanceOffset: true,
        timestamp: 1000,
        updatedAt: 1000,
      },
      {
        id: 'tx2',
        type: 'spending',
        amount: 5,
        categoryId: 'coffee',
        friendIds: ['friend_amine'],
        vibe: 'worth_it',
        countInBalanceOffset: true,
        timestamp: 2000,
        updatedAt: 2000,
      },
      // Mehdi: 1 normal lunch (15 DT -> CPH = 15 DT)
      {
        id: 'tx3',
        type: 'spending',
        amount: 15,
        categoryId: 'food',
        friendIds: ['friend_mehdi'],
        vibe: 'worth_it',
        countInBalanceOffset: true,
        timestamp: 3000,
        updatedAt: 3000,
      },
      // Yassine + Sarra duo hangout: 45 DT -> CPH = 45 DT
      {
        id: 'tx4',
        type: 'spending',
        amount: 45,
        categoryId: 'entertainment',
        friendIds: ['friend_yassine', 'friend_sarra'],
        vibe: 'regret',
        countInBalanceOffset: true,
        timestamp: 4000,
        updatedAt: 4000,
      },
      // Monthly fixed rent tagged with a friend should be ignored by social CPH baseline
      {
        id: 'tx_rent',
        type: 'spending',
        amount: 700,
        categoryId: 'rent',
        friendIds: ['friend_amine'],
        countInBalanceOffset: false,
        timestamp: 5000,
        updatedAt: 5000,
      },
    ];

    const report = computeFriendInfluence(
      DEFAULT_FRIENDS,
      txs,
      DEFAULT_CATEGORIES
    );

    // Active CPHs: Amine=5, Mehdi=15, Yassine=45, Sarra=45 -> Median of [5, 15, 45, 45] = 30 DT
    expect(report.medianSocialCph).toBe(30);

    const amine = report.friendsMetrics.find(
      (m) => m.friend.id === 'friend_amine'
    )!;
    expect(amine.cph).toBe(5);
    expect(amine.effectiveInfluence).toBe('good');
    expect(amine.topCategory?.categoryId).toBe('coffee');

    const yassine = report.friendsMetrics.find(
      (m) => m.friend.id === 'friend_yassine'
    )!;
    expect(yassine.cph).toBe(45);
    expect(yassine.effectiveInfluence).toBe('bad');

    // Combo Duo: Yassine + Sarra
    expect(report.comboDuos).toHaveLength(1);
    expect(report.comboDuos[0].jointCph).toBe(45);
    expect(report.comboDuos[0].isSpikeDuo).toBe(true);
  });

  it('cycles manual override in order: null -> good -> bad -> neutral -> null', () => {
    expect(cycleManualOverride(null)).toBe('good');
    expect(cycleManualOverride('good')).toBe('bad');
    expect(cycleManualOverride('bad')).toBe('neutral');
    expect(cycleManualOverride('neutral')).toBeNull();
  });

  it('handles empty friend lists and edge ratios', () => {
    expect(computeMedian([])).toBe(0);
    expect(classifyInfluenceRatio(0.9, 3)).toBe('good');
    expect(classifyInfluenceRatio(1.0, 3)).toBe('neutral');
    expect(classifyInfluenceRatio(1.25, 3)).toBe('bad');
    expect(classifyInfluenceRatio(0.5, 0)).toBe('neutral');
  });
});

describe('High-Signal Metrics Dashboard Engine & Monthly Fixed Bills Filter', () => {
  const now = 1_760_000_000_000;
  const sampleTxs: Transaction[] = [
    {
      id: 'd1',
      type: 'spending',
      amount: 5,
      categoryId: 'coffee',
      friendIds: [],
      vibe: 'worth_it',
      countInBalanceOffset: true,
      timestamp: now - 3600_000,
      updatedAt: now - 3600_000,
    },
    {
      id: 'd2',
      type: 'spending',
      amount: 25,
      categoryId: 'food',
      friendIds: ['friend_yassine'],
      vibe: 'regret',
      countInBalanceOffset: true,
      timestamp: now - 86_400_000,
      updatedAt: now - 86_400_000,
    },
    {
      id: 'm1',
      type: 'spending',
      amount: 650,
      categoryId: 'rent',
      friendIds: [],
      vibe: 'worth_it',
      countInBalanceOffset: false,
      timestamp: now - 2 * 86_400_000,
      updatedAt: now - 2 * 86_400_000,
    },
  ];

  it('excludes Monthly Fixed Bills when includeMonthlyBills is false', () => {
    const excluded = computeDashboardMetrics(sampleTxs, DEFAULT_CATEGORIES, {
      includeMonthlyBills: false,
      now,
    });

    expect(excluded.totalSpendDisplayed).toBe(30); // 5 + 25 DT
    expect(excluded.monthlyFixedBillsTotal).toBe(650);
    expect(excluded.monthlyFixedBillsCount).toBe(1);
    expect(excluded.categoryBreakdown.some((c) => c.categoryId === 'rent')).toBe(
      false
    );
    expect(excluded.soloVsSocial.soloSpend).toBe(5);
    expect(excluded.soloVsSocial.socialSpend).toBe(25);
    expect(excluded.soloVsSocial.friendTaxMultiplier).toBe(5);
    expect(excluded.heatmap28Days).toHaveLength(28);
  });

  it('includes Monthly Fixed Bills when includeMonthlyBills is true', () => {
    const included = computeDashboardMetrics(sampleTxs, DEFAULT_CATEGORIES, {
      includeMonthlyBills: true,
      now,
    });

    expect(included.totalSpendDisplayed).toBe(680); // 5 + 25 + 650 DT
    expect(included.categoryBreakdown[0].categoryId).toBe('rent');
  });

  it('produces 28 unique consecutive local calendar dateKeys across DST transitions', () => {
    // March 30, 2026 00:30 local time (immediately after a March 29 spring-forward day)
    const dstNow = new Date(2026, 2, 30, 0, 30, 0, 0).getTime();
    const report = computeDashboardMetrics(sampleTxs, DEFAULT_CATEGORIES, {
      includeMonthlyBills: false,
      now: dstNow,
    });

    expect(report.heatmap28Days).toHaveLength(28);
    const uniqueKeys = new Set(report.heatmap28Days.map((c) => c.dateKey));
    expect(uniqueKeys.size).toBe(28);
    expect(report.heatmap28Days[27].dateKey).toBe('2026-03-30');
    expect(report.heatmap28Days[26].dateKey).toBe('2026-03-29');
    expect(report.heatmap28Days[25].dateKey).toBe('2026-03-28');
  });
});
