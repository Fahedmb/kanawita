'use client';

import React, { useState } from 'react';
import {
  Trash2,
  Undo2,
  Clock,
  ThumbsUp,
  Skull,
  Filter,
} from 'lucide-react';
import {
  Friend,
  SpendingCategory,
  Transaction,
} from '@/domain/models';
import { formatTND } from '@/domain/formatTND';
import {
  restoreTransaction,
  softDeleteTransaction,
} from '@/data/repository';

interface RecentActivitySheetProps {
  transactions: Transaction[];
  categories: SpendingCategory[];
  friends: Friend[];
  compactLimit?: number;
}

type FeedFilter = 'all' | 'solo' | 'social' | 'monthly';

const formatRelativeTime = (timestamp: number): string => {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

export const RecentActivitySheet: React.FC<RecentActivitySheetProps> = ({
  transactions,
  categories,
  friends,
  compactLimit,
}) => {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [recentlyDeletedTx, setRecentlyDeletedTx] =
    useState<Transaction | null>(null);

  const categoryMap = new Map<string, SpendingCategory>(
    categories.map((c) => [c.id, c])
  );
  const friendMap = new Map<string, Friend>(friends.map((f) => [f.id, f]));

  const activeSpendings = transactions
    .filter((tx) => !tx.deletedAt && tx.type === 'spending')
    .filter((tx) => {
      if (filter === 'solo') return tx.friendIds.length === 0;
      if (filter === 'social') return tx.friendIds.length > 0;
      if (filter === 'monthly') {
        const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
        return cat?.kind === 'monthly';
      }
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const displayedTxs = compactLimit
    ? activeSpendings.slice(0, compactLimit)
    : activeSpendings;

  const handleDelete = async (tx: Transaction) => {
    await softDeleteTransaction(tx.id);
    setRecentlyDeletedTx(tx);
  };

  const handleRestore = async () => {
    if (!recentlyDeletedTx) return;
    await restoreTransaction(recentlyDeletedTx.id);
    setRecentlyDeletedTx(null);
  };

  return (
    <section
      aria-label="Recent Spendings Activity"
      className="rounded-2xl bg-[#0F121B] border border-white/[0.07] p-3.5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Recent Activity ({activeSpendings.length})
          </h2>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-zinc-500 mr-0.5" />
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'solo', label: 'Solo' },
              { id: 'social', label: 'Friends' },
              { id: 'monthly', label: 'Fixed' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold transition-all active:scale-[0.96] ${
                filter === tab.id
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-white/[0.03] text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inline Undo banner when deleting from list */}
      {recentlyDeletedTx && (
        <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-200">
          <span>
            Removed{' '}
            <strong className="font-mono tabular-nums">
              {formatTND(recentlyDeletedTx.amount)}
            </strong>{' '}
            entry
          </span>
          <button
            type="button"
            onClick={handleRestore}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 active:scale-[0.96]"
          >
            <Undo2 className="h-3 w-3" />
            <span>Restore</span>
          </button>
        </div>
      )}

      {displayedTxs.length === 0 ? (
        <div className="rounded-xl bg-[#090B10] border border-white/[0.04] py-6 text-center text-xs text-zinc-400">
          No spendings logged in this view yet. Type an amount above and tap a
          category icon!
        </div>
      ) : (
        <div className="space-y-1.5">
          {displayedTxs.map((tx) => {
            const cat = tx.categoryId
              ? categoryMap.get(tx.categoryId)
              : undefined;
            const taggedFriends = tx.friendIds
              .map((id) => friendMap.get(id))
              .filter((f): f is Friend => Boolean(f));

            return (
              <div
                key={tx.id}
                data-testid={`activity-row-${tx.id}`}
                className="flex items-center justify-between gap-2.5 rounded-xl bg-[#0A0D14] hover:bg-[#111520] border border-white/[0.05] px-3 py-2.5 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.07] text-lg">
                    {cat?.icon ?? '📦'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-white truncate">
                        {cat?.name ?? 'Other'}
                      </span>

                      {cat?.kind === 'monthly' && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.2 text-[9px] font-semibold text-amber-300 border border-amber-500/20">
                          Monthly Fixed
                        </span>
                      )}

                      {taggedFriends.length === 0 ? (
                        <span className="rounded-full bg-white/[0.04] px-1.5 py-0.2 text-[10px] text-zinc-400">
                          Solo
                        </span>
                      ) : (
                        taggedFriends.map((f) => (
                          <span
                            key={f.id}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.2 text-[10px] font-semibold text-emerald-300"
                          >
                            {f.name}
                          </span>
                        ))
                      )}

                      {tx.vibe === 'worth_it' && (
                        <span
                          title="Worth it"
                          className="inline-flex items-center text-emerald-400"
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </span>
                      )}
                      {tx.vibe === 'regret' && (
                        <span
                          title="Regret"
                          className="inline-flex items-center text-rose-400"
                        >
                          <Skull className="h-3 w-3" />
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400 truncate">
                      <span>{formatRelativeTime(tx.timestamp)}</span>
                      {tx.note && (
                        <>
                          <span>•</span>
                          <span className="text-zinc-300 truncate">
                            {tx.note}
                          </span>
                        </>
                      )}
                      {!tx.countInBalanceOffset && (
                        <>
                          <span>•</span>
                          <span className="text-[10px] text-zinc-500">
                            Synced baseline
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-sm font-bold text-white tabular-nums">
                    -{formatTND(tx.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(tx)}
                    aria-label={`Delete ${formatTND(tx.amount)} spending`}
                    className="rounded-lg p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.94] transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
