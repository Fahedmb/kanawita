import { Transaction, VaultAccount, VaultId } from './models';
import { roundTND } from './formatTND';

export interface VaultShareItem extends VaultAccount {
  sharePct: number;
}

export interface UnifiedBalanceSummary {
  grossVaultsTotal: number;
  activeSpendingOffset: number;
  remainingTotalMoney: number;
  activeOffsetCount: number;
  totalHistoricalSpend: number;
  vaultBreakdown: VaultShareItem[];
}

const VAULT_ORDER: VaultId[] = ['uib_bank', 'savings', 'post_office'];

/**
 * Computes the Unified Total Money Pool and 3 Reference Vaults breakdown:
 *   Gross Vaults Total = Bank (UIB) + Savings + Post Office (D17)
 *   Remaining Total Money = Gross Vaults Total - Sum(Active Spendings with countInBalanceOffset = true)
 */
export const computeUnifiedBalance = (
  vaults: VaultAccount[],
  transactions: Transaction[]
): UnifiedBalanceSummary => {
  const orderedVaults = [...vaults].sort(
    (a, b) => VAULT_ORDER.indexOf(a.id) - VAULT_ORDER.indexOf(b.id)
  );

  const grossVaultsTotal = roundTND(
    orderedVaults.reduce((sum, vault) => sum + (Number.isFinite(vault.balance) ? vault.balance : 0), 0)
  );

  let activeSpendingOffset = 0;
  let activeOffsetCount = 0;
  let totalHistoricalSpend = 0;

  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    if (tx.type !== 'spending') continue;
    if (!Number.isFinite(tx.amount) || tx.amount <= 0) continue;

    totalHistoricalSpend = roundTND(totalHistoricalSpend + tx.amount);

    if (tx.countInBalanceOffset) {
      activeSpendingOffset = roundTND(activeSpendingOffset + tx.amount);
      activeOffsetCount += 1;
    }
  }

  const remainingTotalMoney = roundTND(grossVaultsTotal - activeSpendingOffset);

  const vaultBreakdown: VaultShareItem[] = orderedVaults.map((v) => ({
    ...v,
    balance: roundTND(v.balance),
    sharePct:
      grossVaultsTotal > 0
        ? Math.round((Math.max(0, v.balance) / grossVaultsTotal) * 1000) / 10
        : 0,
  }));

  return {
    grossVaultsTotal,
    activeSpendingOffset,
    remainingTotalMoney,
    activeOffsetCount,
    totalHistoricalSpend,
    vaultBreakdown,
  };
};
