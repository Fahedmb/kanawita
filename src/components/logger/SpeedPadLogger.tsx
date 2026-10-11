'use client';

import React, { useState } from 'react';
import {
  Delete,
  UserPlus,
  ThumbsUp,
  Skull,
  Undo2,
  StickyNote,
  Check,
  X,
} from 'lucide-react';
import {
  Friend,
  InfluenceLevel,
  SpendingCategory,
  Transaction,
  TransactionVibe,
} from '@/domain/models';
import {
  addQuickAmount,
  appendKeypadKey,
  backspaceKeypad,
  formatTND,
  parseKeypadAmount,
} from '@/domain/formatTND';
import { FriendInfluenceMetric } from '@/domain/influenceEngine';
import {
  addFriend,
  logSpendingInstant,
  softDeleteTransaction,
} from '@/data/repository';

interface SpeedPadLoggerProps {
  categories: SpendingCategory[];
  friends: Friend[];
  friendMetricsMap: Map<string, FriendInfluenceMetric>;
  onSavedTransaction?: (tx: Transaction) => void;
}

const getInfluenceDotColor = (level?: InfluenceLevel): string => {
  if (level === 'good') return 'bg-emerald-400';
  if (level === 'bad') return 'bg-rose-500';
  return 'bg-amber-400';
};

export const SpeedPadLogger: React.FC<SpeedPadLoggerProps> = ({
  categories,
  friends,
  friendMetricsMap,
  onSavedTransaction,
}) => {
  const [keypadValue, setKeypadValue] = useState<string>('0');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [selectedVibe, setSelectedVibe] = useState<TransactionVibe>(null);
  const [noteText, setNoteText] = useState<string>('');
  const [showNoteInput, setShowNoteInput] = useState<boolean>(false);

  // Inline "+ Add Friend" state
  const [isAddingFriend, setIsAddingFriend] = useState<boolean>(false);
  const [newFriendName, setNewFriendName] = useState<string>('');

  // Shake state when tapping category with 0 DT
  const [shakeAmount, setShakeAmount] = useState<boolean>(false);
  const [helperPrompt, setHelperPrompt] = useState<string | null>(null);

  // 5-Second Undo Toast state
  const [undoToast, setUndoToast] = useState<{
    tx: Transaction;
    category: SpendingCategory;
    friendNames: string[];
  } | null>(null);

  const numericAmount = parseKeypadAmount(keypadValue);

  const triggerHaptic = (durationMs = 15) => {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        navigator.vibrate(durationMs);
      } catch {
        // Ignore on unsupported browsers
      }
    }
  };

  const handleKeyPress = (key: string) => {
    triggerHaptic(8);
    setHelperPrompt(null);
    setKeypadValue((prev) => appendKeypadKey(prev, key));
  };

  const handleBackspace = () => {
    triggerHaptic(8);
    setKeypadValue((prev) => backspaceKeypad(prev));
  };

  const handleClearAmount = () => {
    triggerHaptic(10);
    setKeypadValue('0');
  };

  const handleQuickAdd = (delta: number) => {
    triggerHaptic(12);
    setHelperPrompt(null);
    setKeypadValue((prev) => addQuickAmount(prev, delta));
  };

  const toggleFriendSelection = (friendId: string) => {
    triggerHaptic(10);
    setSelectedFriendIds((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  const selectSolo = () => {
    triggerHaptic(10);
    setSelectedFriendIds([]);
  };

  const toggleVibe = (target: 'worth_it' | 'regret') => {
    triggerHaptic(10);
    setSelectedVibe((prev) => (prev === target ? null : target));
  };

  const handleInlineAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFriendName.trim();
    if (!trimmed) return;
    const created = await addFriend(trimmed);
    setSelectedFriendIds((prev) => [...prev, created.id]);
    setNewFriendName('');
    setIsAddingFriend(false);
  };

  /**
   * 2-Second "Tap Category = Instant Save" handler:
   * Immediately persists the transaction, resets the keypad, and shows the 5-second Undo toast.
   */
  const handleCategoryTapInstantSave = async (category: SpendingCategory) => {
    if (numericAmount <= 0) {
      triggerHaptic(30);
      setShakeAmount(true);
      setHelperPrompt(
        `Type an amount in DT first, then tap ${category.icon} ${category.name} to instant-save!`
      );
      setTimeout(() => setShakeAmount(false), 360);
      return;
    }

    triggerHaptic(20);

    const friendNames = selectedFriendIds
      .map((id) => friends.find((f) => f.id === id)?.name)
      .filter((n): n is string => Boolean(n));

    // Reset UI immediately for 0ms perceived latency
    const amountToSave = numericAmount;
    const friendsToSave = [...selectedFriendIds];
    const vibeToSave = selectedVibe;
    const noteToSave = noteText;

    setKeypadValue('0');
    setSelectedFriendIds([]);
    setSelectedVibe(null);
    setNoteText('');
    setShowNoteInput(false);
    setHelperPrompt(null);

    const savedTx = await logSpendingInstant({
      amount: amountToSave,
      categoryId: category.id,
      friendIds: friendsToSave,
      vibe: vibeToSave,
      note: noteToSave,
    });

    setUndoToast({
      tx: savedTx,
      category,
      friendNames,
    });

    onSavedTransaction?.(savedTx);

    // Auto-dismiss Undo toast after 5 seconds
    setTimeout(() => {
      setUndoToast((current) =>
        current?.tx.id === savedTx.id ? null : current
      );
    }, 5000);
  };

  const handleUndoLastSave = async () => {
    if (!undoToast) return;
    const txToRestore = undoToast.tx;
    setUndoToast(null);
    triggerHaptic(15);
    await softDeleteTransaction(txToRestore.id);
    // Put the amount and metadata back on the keypad so user can re-tap the right category
    setKeypadValue(String(txToRestore.amount));
    setSelectedFriendIds(txToRestore.friendIds);
    setSelectedVibe(txToRestore.vibe ?? null);
    setNoteText(txToRestore.note ?? '');
    setShowNoteInput(Boolean(txToRestore.note));
  };

  const sortedCategories = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <section
      aria-label="2-Second Instant-Save TND Speed-Pad"
      className="space-y-2.5"
    >
      {/* 5-Second Floating Undo Toast */}
      {undoToast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="instant-save-undo-toast"
          className="flex items-center justify-between gap-2 rounded-xl bg-emerald-950/95 border border-emerald-500/40 px-3.5 py-2.5 text-xs text-emerald-100 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center gap-2 truncate">
            <span className="text-base">{undoToast.category.icon}</span>
            <div className="truncate">
              <span className="font-bold font-mono tabular-nums text-emerald-300">
                -{formatTND(undoToast.tx.amount)}
              </span>{' '}
              <span>in {undoToast.category.name}</span>
              {undoToast.friendNames.length > 0 && (
                <span className="text-emerald-300/90">
                  {' '}
                  • w/ {undoToast.friendNames.join(', ')}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleUndoLastSave}
            data-testid="undo-save-button"
            className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-emerald-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-emerald-300 active:scale-[0.96] transition-transform"
          >
            <Undo2 className="h-3 w-3" />
            <span>Undo</span>
          </button>
        </div>
      )}

      {/* Stage 1: Amount Display + Quick Add Chips + Vibe Pill */}
      <div
        className={`rounded-2xl bg-[#10131C] border px-3.5 py-3 transition-colors duration-150 ${
          shakeAmount
            ? 'border-rose-500/60 bg-rose-950/20 animate-pulse'
            : numericAmount > 0
              ? 'border-emerald-500/40'
              : 'border-white/[0.07]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => toggleVibe('worth_it')}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold border transition-all active:scale-[0.96] ${
                selectedVibe === 'worth_it'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ThumbsUp className="h-3 w-3" />
              <span>Worth it</span>
            </button>
            <button
              type="button"
              onClick={() => toggleVibe('regret')}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold border transition-all active:scale-[0.96] ${
                selectedVibe === 'regret'
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                  : 'bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Skull className="h-3 w-3" />
              <span>Regret</span>
            </button>
            <button
              type="button"
              onClick={() => setShowNoteInput((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold border transition-all active:scale-[0.96] ${
                showNoteInput || noteText
                  ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                  : 'bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <StickyNote className="h-3 w-3" />
              <span>{noteText ? 'Note set' : 'Note'}</span>
            </button>
          </div>

          {keypadValue !== '0' && (
            <button
              type="button"
              onClick={handleClearAmount}
              className="text-[11px] font-medium text-zinc-400 hover:text-white active:scale-[0.96]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Giant Tabular TND Display */}
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span
              data-testid="speedpad-amount-display"
              className={`font-mono text-3xl sm:text-4xl font-bold tracking-tight tabular-nums truncate ${
                numericAmount > 0 ? 'text-emerald-400' : 'text-zinc-500'
              }`}
            >
              {keypadValue}
            </span>
            <span className="font-mono text-sm font-bold text-zinc-400">
              DT
            </span>
          </div>

          {/* Quick +1, +5, +10 DT Chips */}
          <div className="flex items-center gap-1.5 shrink-0">
            {[1, 5, 10].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => handleQuickAdd(delta)}
                data-testid={`quick-chip-${delta}`}
                className="rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 px-2.5 py-1.5 font-mono text-xs font-bold text-emerald-300 active:scale-[0.96] transition-transform touch-manipulation select-none"
              >
                +{delta}
              </button>
            ))}
          </div>
        </div>

        {helperPrompt && (
          <p className="mt-1.5 text-[11px] font-medium text-rose-300">
            {helperPrompt}
          </p>
        )}

        {showNoteInput && (
          <div className="mt-2">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Optional note (e.g. Express + Croissant)..."
              maxLength={60}
              className="w-full rounded-lg bg-[#090B10] border border-white/[0.1] px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Stage 2: Custom Tactile TND Keypad (0-9, ., ⌫) — Never opens native text keyboard */}
      <div className="grid grid-cols-4 gap-1.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleKeyPress(key)}
            data-testid={`keypad-key-${key}`}
            className="flex h-12 items-center justify-center rounded-xl bg-[#121621] hover:bg-[#181D2B] border border-white/[0.06] font-mono text-lg font-bold text-white tabular-nums active:scale-[0.96] active:bg-emerald-500/20 transition-all duration-100 touch-manipulation select-none"
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={handleBackspace}
          data-testid="keypad-key-backspace"
          aria-label="Backspace"
          className="flex h-12 items-center justify-center rounded-xl bg-[#121621] hover:bg-[#181D2B] border border-white/[0.06] text-zinc-300 active:scale-[0.96] active:bg-rose-500/20 transition-all duration-100 touch-manipulation select-none"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>

      {/* Stage 3: Horizontal Scrollable Friend Chips Bar */}
      <div className="rounded-xl bg-[#0E111A] border border-white/[0.06] px-2.5 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Who Was With You?{' '}
            {selectedFriendIds.length > 0 && (
              <span className="text-emerald-400">
                ({selectedFriendIds.length} tagged)
              </span>
            )}
          </span>
          {selectedFriendIds.length > 1 && (
            <span className="text-[10px] font-medium text-amber-300">
              Combo Hangout Tracked
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {/* Solo Chip */}
          <button
            type="button"
            onClick={selectSolo}
            data-testid="friend-chip-solo"
            className={`inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition-all active:scale-[0.96] touch-manipulation select-none ${
              selectedFriendIds.length === 0
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                : 'bg-[#141824] text-zinc-300 border-white/[0.07] hover:text-white'
            }`}
          >
            <span>🧍 Solo</span>
          </button>

          {/* User Friends Chips */}
          {friends.map((friend) => {
            const isSelected = selectedFriendIds.includes(friend.id);
            const metric = friendMetricsMap.get(friend.id);
            const dotClass = getInfluenceDotColor(metric?.effectiveInfluence);

            return (
              <button
                key={friend.id}
                type="button"
                onClick={() => toggleFriendSelection(friend.id)}
                data-testid={`friend-chip-${friend.id}`}
                className={`inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition-all active:scale-[0.96] touch-manipulation select-none ${
                  isSelected
                    ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400 shadow-sm'
                    : 'bg-[#141824] text-zinc-300 border-white/[0.07] hover:text-white'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${dotClass}`}
                  title={`Influence: ${metric?.effectiveInfluence ?? 'neutral'}`}
                />
                <span>{friend.name}</span>
              </button>
            );
          })}

          {/* Inline + Add Friend Chip */}
          {!isAddingFriend ? (
            <button
              type="button"
              onClick={() => setIsAddingFriend(true)}
              data-testid="inline-add-friend-trigger"
              className="inline-flex items-center gap-1 shrink-0 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-dashed border-white/[0.15] px-2.5 py-1.5 text-xs font-medium text-zinc-300 active:scale-[0.96]"
            >
              <UserPlus className="h-3.5 w-3.5 text-emerald-400" />
              <span>+ Friend</span>
            </button>
          ) : (
            <form
              onSubmit={handleInlineAddFriend}
              className="inline-flex items-center gap-1 shrink-0"
            >
              <input
                type="text"
                value={newFriendName}
                onChange={(e) => setNewFriendName(e.target.value)}
                placeholder="Friend name..."
                maxLength={24}
                autoFocus
                className="w-28 rounded-full bg-[#090B10] border border-emerald-500/50 px-2.5 py-1 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Confirm add friend"
                className="rounded-full bg-emerald-500 p-1 text-slate-950 active:scale-[0.95]"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Cancel add friend"
                onClick={() => {
                  setIsAddingFriend(false);
                  setNewFriendName('');
                }}
                className="rounded-full bg-white/[0.08] p-1 text-zinc-300 active:scale-[0.95]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Stage 4: Single 1-Tap Category Grid (Daily + Monthly Fixed — Tap = Instant Save) */}
      <div>
        <div className="flex items-center justify-between px-1 mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Tap Category = Instant Save
          </span>
          <span className="text-[10px] text-zinc-400">
            {numericAmount > 0 ? (
              <strong className="text-emerald-400 font-mono tabular-nums">
                Ready: Tap icon to log {formatTND(numericAmount)}
              </strong>
            ) : (
              'Daily + Monthly Fixed'
            )}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {sortedCategories.map((category) => {
            const isMonthly = category.kind === 'monthly';
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategoryTapInstantSave(category)}
                data-testid={`category-tile-${category.id}`}
                className={`group relative flex flex-col items-center justify-center rounded-xl p-2 text-center border transition-all duration-150 ease-out-expo active:scale-[0.94] touch-manipulation select-none ${
                  numericAmount > 0
                    ? 'bg-[#141926] border-emerald-500/30 hover:border-emerald-400 shadow-sm'
                    : 'bg-[#10131C] border-white/[0.06] hover:border-white/[0.14]'
                }`}
              >
                {isMonthly && (
                  <span className="absolute top-1 right-1 rounded bg-amber-500/15 px-1 py-0.2 text-[8px] font-bold uppercase tracking-tighter text-amber-300 border border-amber-500/20">
                    Fixed
                  </span>
                )}
                <span className="text-xl sm:text-2xl leading-none">
                  {category.icon}
                </span>
                <span className="mt-1.5 text-[10px] font-semibold text-zinc-200 truncate w-full">
                  {category.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
