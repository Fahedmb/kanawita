'use client';

import React, { useState } from 'react';
import {
  Landmark,
  PiggyBank,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  AlertCircle,
  Sparkles,
  X,
  Plus,
  Minus,
  Equal,
} from 'lucide-react';
import {
  SyncRuntimeStatus,
  VaultAccount,
  VaultId,
} from '@/domain/models';
import {
  formatTND,
  parseKeypadAmount,
} from '@/domain/formatTND';
import { UnifiedBalanceSummary } from '@/domain/balanceEngine';
import {
  clearAllSpendingOffsets,
  updateVaultBalance,
} from '@/data/repository';

interface UnifiedVaultHeaderProps {
  balanceSummary: UnifiedBalanceSummary;
  syncStatus: SyncRuntimeStatus;
  onOpenSettingsTab: () => void;
  onToast: (message: string) => void;
}

const getVaultIcon = (id: VaultId) => {
  switch (id) {
    case 'uib_bank':
      return Landmark;
    case 'savings':
      return PiggyBank;
    case 'post_office':
      return Smartphone;
  }
};

export const UnifiedVaultHeader: React.FC<UnifiedVaultHeaderProps> = ({
  balanceSummary,
  syncStatus,
  onOpenSettingsTab,
  onToast,
}) => {
  const [editingVault, setEditingVault] = useState<VaultAccount | null>(null);
  const [editMode, setEditMode] = useState<'set' | 'add' | 'subtract'>('set');
  const [rawAmount, setRawAmount] = useState<string>('');
  const [clearOffsetOnSave, setClearOffsetOnSave] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const openVaultEditor = (vault: VaultAccount) => {
    setEditingVault(vault);
    setEditMode('set');
    setRawAmount(String(vault.balance));
    setClearOffsetOnSave(false);
  };

  const handleModeSwitch = (mode: 'set' | 'add' | 'subtract') => {
    setEditMode(mode);
    if (mode === 'set' && editingVault) {
      setRawAmount(String(editingVault.balance));
    } else {
      setRawAmount('');
    }
  };

  const handleQuickChip = (delta: number) => {
    const current = parseKeypadAmount(rawAmount);
    const next = Math.max(0, current + delta);
    setRawAmount(String(next));
  };

  const handleSaveVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVault || isSaving) return;

    const amount = parseKeypadAmount(rawAmount);
    if (editMode !== 'set' && amount <= 0) {
      onToast('Enter an amount greater than 0 DT');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateVaultBalance({
        vaultId: editingVault.id,
        mode: editMode,
        amount,
        clearSpendingOffset: clearOffsetOnSave,
      });

      const offsetNotice = clearOffsetOnSave
        ? ' & absorbed spending offset'
        : '';
      onToast(
        `${updated.name} updated to ${formatTND(updated.balance)}${offsetNotice}`
      );
      setEditingVault(null);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update vault');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAbsorbOffsetOnly = async () => {
    if (balanceSummary.activeSpendingOffset <= 0) return;
    const count = await clearAllSpendingOffsets();
    onToast(
      `Absorbed ${count} spending${count === 1 ? '' : 's'} into baseline (metrics kept 100%)`
    );
  };

  const renderSyncBadge = () => {
    switch (syncStatus.state) {
      case 'synced':
        return (
          <button
            type="button"
            onClick={onOpenSettingsTab}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 border border-emerald-500/20 active:scale-[0.97] transition-transform duration-150"
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>Synced to Mongo</span>
          </button>
        );
      case 'syncing':
        return (
          <button
            type="button"
            onClick={onOpenSettingsTab}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-400 border border-sky-500/20 active:scale-[0.97] transition-transform duration-150"
          >
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Syncing...</span>
          </button>
        );
      case 'queued_offline':
        return (
          <button
            type="button"
            onClick={onOpenSettingsTab}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 border border-amber-500/20 active:scale-[0.97] transition-transform duration-150"
          >
            <CloudUpload className="h-3 w-3" />
            <span>Offline Queue ({syncStatus.outboxCount})</span>
          </button>
        );
      case 'sync_error':
        return (
          <button
            type="button"
            onClick={onOpenSettingsTab}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-400 border border-rose-500/20 active:scale-[0.97] transition-transform duration-150"
          >
            <AlertCircle className="h-3 w-3" />
            <span>Sync Retry ({syncStatus.outboxCount})</span>
          </button>
        );
      case 'local_only':
      default:
        return (
          <button
            type="button"
            onClick={onOpenSettingsTab}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300 border border-white/[0.08] active:scale-[0.97] transition-transform duration-150"
          >
            <CloudOff className="h-3 w-3 text-emerald-400" />
            <span>Saved on Phone</span>
          </button>
        );
    }
  };

  const isNegativeRemaining = balanceSummary.remainingTotalMoney < 0;

  return (
    <header className="relative rounded-2xl bg-gradient-to-b from-[#131722] to-[#0D1017] p-3.5 border border-white/[0.08] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]">
      {/* Top Bar: Brand + Live Sync Status */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-sm">
            ك
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold tracking-tight text-white">
                Kanawita
              </h1>
              <span className="text-[11px] text-zinc-400 font-medium">
                كنويطة
              </span>
            </div>
          </div>
        </div>
        {renderSyncBadge()}
      </div>

      {/* Unified Total Money Hero */}
      <div className="flex flex-col items-center justify-center py-1.5 text-center">
        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
          Unified Remaining Money
        </span>
        <div
          className={`mt-0.5 font-mono text-3xl sm:text-4xl font-bold tracking-tight tabular-nums ${
            isNegativeRemaining ? 'text-rose-400' : 'text-white'
          }`}
          data-testid="unified-total-money"
        >
          {formatTND(balanceSummary.remainingTotalMoney)}
        </div>

        {/* Gross Vaults vs Active Spending Offset Strip */}
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-zinc-400 font-mono tabular-nums">
          <span>
            3 Vaults:{' '}
            <strong className="text-zinc-200 font-semibold">
              {formatTND(balanceSummary.grossVaultsTotal)}
            </strong>
          </span>
          <span className="text-zinc-600">•</span>
          <span>
            Spent Since Sync:{' '}
            <strong className="text-amber-400 font-semibold">
              -{formatTND(balanceSummary.activeSpendingOffset)}
            </strong>
          </span>
          {balanceSummary.activeSpendingOffset > 0 && (
            <button
              type="button"
              onClick={handleAbsorbOffsetOnly}
              title="Reset the spent offset counter after updating your real bank/D17 balances"
              className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] px-1.5 py-0.5 text-[10px] font-sans font-medium text-emerald-300 border border-emerald-500/20 active:scale-[0.97] transition-transform"
            >
              <Sparkles className="h-2.5 w-2.5" />
              <span>Clear Offset</span>
            </button>
          )}
        </div>
      </div>

      {/* 3 Reference Vaults Strip (UIB Bank, Savings, Post Office / D17) */}
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {balanceSummary.vaultBreakdown.map((vault) => {
          const Icon = getVaultIcon(vault.id);
          return (
            <button
              key={vault.id}
              type="button"
              onClick={() => openVaultEditor(vault)}
              data-testid={`vault-card-${vault.id}`}
              className="group relative flex flex-col justify-between rounded-xl bg-[#090B10]/90 p-2.5 text-left border border-white/[0.06] hover:border-white/[0.15] active:scale-[0.97] transition-all duration-150 ease-out-expo"
            >
              <div className="flex items-center justify-between gap-1 w-full">
                <span className="text-[11px] font-semibold text-zinc-300 truncate">
                  {vault.name}
                </span>
                <Icon
                  className="h-3.5 w-3.5 shrink-0 opacity-80"
                  style={{ color: vault.color }}
                />
              </div>

              <div className="mt-1.5 font-mono text-xs sm:text-sm font-bold text-white tabular-nums truncate">
                {formatTND(vault.balance)}
              </div>

              <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
                <span className="truncate">{vault.subtitle}</span>
                <span className="font-mono text-zinc-400 tabular-nums">
                  {vault.sharePct}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Vault Adjustment Modal / Sheet */}
      {editingVault && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vault-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#121620] border border-white/[0.1] p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
              <div>
                <h2
                  id="vault-modal-title"
                  className="text-base font-bold text-white"
                >
                  Update {editingVault.name}
                </h2>
                <p className="text-xs text-zinc-400 font-mono tabular-nums">
                  Current Reference: {formatTND(editingVault.balance)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingVault(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.06] active:scale-[0.95]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVault} className="mt-3 space-y-3">
              {/* Mode selector: Set / Add / Subtract */}
              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#0A0C12] p-1 border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('set')}
                  className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition-all active:scale-[0.97] ${
                    editMode === 'set'
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Equal className="h-3.5 w-3.5" />
                  <span>Set Balance</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('add')}
                  className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition-all active:scale-[0.97] ${
                    editMode === 'add'
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add DT</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('subtract')}
                  className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition-all active:scale-[0.97] ${
                    editMode === 'subtract'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Minus className="h-3.5 w-3.5" />
                  <span>Subtract</span>
                </button>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  {editMode === 'set'
                    ? 'New Exact Balance (DT)'
                    : editMode === 'add'
                      ? 'Amount to Add (DT)'
                      : 'Amount to Subtract (DT)'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={rawAmount}
                    onChange={(e) => setRawAmount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl bg-[#090B10] border border-white/[0.1] px-3.5 py-2.5 font-mono text-lg font-bold text-white tabular-nums focus:border-emerald-500 focus:outline-none"
                    autoFocus
                  />
                  <span className="absolute right-3.5 font-mono text-xs font-semibold text-zinc-400">
                    DT
                  </span>
                </div>

                {/* Quick DT step chips */}
                <div className="mt-2 flex items-center gap-1.5">
                  {[10, 50, 100, 500].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleQuickChip(chip)}
                      className="flex-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] py-1.5 font-mono text-xs font-semibold text-emerald-300 active:scale-[0.97] transition-transform"
                    >
                      +{chip} DT
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Sync & Clear Offset toggle */}
              {balanceSummary.activeSpendingOffset > 0 && (
                <label className="flex items-start gap-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clearOffsetOnSave}
                    onChange={(e) => setClearOffsetOnSave(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div className="text-xs">
                    <div className="font-semibold text-emerald-300">
                      Sync & Clear Spending Offset (-
                      {formatTND(balanceSummary.activeSpendingOffset)})
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Use this when copying your real balance from the official
                      UIB or D17 app. Resets the offset counter while keeping
                      100% of your spending history & metrics.
                    </p>
                  </div>
                </label>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingVault(null)}
                  className="flex-1 rounded-xl bg-white/[0.05] py-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.1] active:scale-[0.97] transition-transform"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 active:scale-[0.97] transition-transform disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Vault Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
