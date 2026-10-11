'use client';

import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Trash2,
  Flame,
  Sparkles,
  RefreshCcw,
  ThumbsUp,
  Skull,
} from 'lucide-react';
import {
  FRIEND_AVATAR_COLORS,
  InfluenceLevel,
} from '@/domain/models';
import { formatTND } from '@/domain/formatTND';
import {
  FriendInfluenceMetric,
  InfluenceEngineReport,
} from '@/domain/influenceEngine';
import {
  addFriend,
  cycleFriendInfluenceOverride,
  removeFriend,
} from '@/data/repository';

interface FriendsInfluenceViewProps {
  report: InfluenceEngineReport;
  onToast: (message: string) => void;
}

const getBadgeConfig = (level: InfluenceLevel) => {
  switch (level) {
    case 'good':
      return {
        label: '🟢 Good Influence',
        bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
        desc: 'Spends <= 90% of median hangout',
      };
    case 'bad':
      return {
        label: '🔴 Bad Influence',
        bg: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
        desc: 'Spikes spend > 20% above baseline',
      };
    case 'neutral':
    default:
      return {
        label: '🟡 Neutral',
        bg: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
        desc: 'Near your normal social baseline',
      };
  }
};

export const FriendsInfluenceView: React.FC<FriendsInfluenceViewProps> = ({
  report,
  onToast,
}) => {
  const [newFriendName, setNewFriendName] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>(
    FRIEND_AVATAR_COLORS[0]
  );
  const [filterLevel, setFilterLevel] = useState<'all' | InfluenceLevel>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFriendName.trim();
    if (!trimmed) {
      onToast('Enter a friend name first');
      return;
    }
    const created = await addFriend(trimmed, selectedColor);
    setNewFriendName('');
    onToast(`Added ${created.name} to your circle`);
  };

  const handleCycleOverride = async (metric: FriendInfluenceMetric) => {
    const nextOverride = await cycleFriendInfluenceOverride(metric.friend.id);
    const modeLabel = nextOverride
      ? `Manual: ${nextOverride.toUpperCase()}`
      : `Auto (${metric.autoInfluence.toUpperCase()})`;
    onToast(`${metric.friend.name} badge set to ${modeLabel}`);
  };

  const handleDeleteFriend = async (friendId: string, name: string) => {
    await removeFriend(friendId);
    setConfirmDeleteId(null);
    onToast(`Removed ${name} from friend list`);
  };

  const filteredFriends = report.friendsMetrics.filter((m) =>
    filterLevel === 'all' ? true : m.effectiveInfluence === filterLevel
  );

  return (
    <div className="space-y-4">
      {/* Top Baseline Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-[#131824] to-[#0D1018] border border-white/[0.08] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">
              Hybrid Friend Influence Engine
            </h2>
          </div>
          <span className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-medium text-zinc-300">
            Tap any badge to override
          </span>
        </div>

        <p className="mt-1 text-xs text-zinc-400">
          Compares each friend&apos;s{' '}
          <strong className="text-zinc-200">
            Average Cost Per Hangout (CPH)
          </strong>{' '}
          against your social median (excluding monthly fixed bills).
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[#090B10] border border-white/[0.06] p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
              Median Social CPH
            </span>
            <span className="mt-1 block font-mono text-sm sm:text-base font-bold text-emerald-400 tabular-nums">
              {formatTND(report.medianSocialCph)}
            </span>
          </div>
          <div className="rounded-xl bg-[#090B10] border border-white/[0.06] p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
              Avg Solo Spend
            </span>
            <span className="mt-1 block font-mono text-sm sm:text-base font-bold text-white tabular-nums">
              {formatTND(report.averageSoloSpend)}
            </span>
          </div>
          <div className="rounded-xl bg-[#090B10] border border-white/[0.06] p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
              Total Social Burn
            </span>
            <span className="mt-1 block font-mono text-sm sm:text-base font-bold text-amber-300 tabular-nums">
              {formatTND(report.totalSocialSpend)}
            </span>
          </div>
        </div>
      </div>

      {/* Add Friend Form */}
      <form
        onSubmit={handleAddFriend}
        className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-3.5 space-y-2.5"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-emerald-400" />
            <span>Add Friend to Your Circle</span>
          </span>
          <div className="flex items-center gap-1">
            {FRIEND_AVATAR_COLORS.slice(0, 6).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                aria-label={`Select avatar color ${color}`}
                className={`h-4 w-4 rounded-full transition-transform ${
                  selectedColor === color
                    ? 'scale-125 ring-2 ring-white'
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newFriendName}
            onChange={(e) => setNewFriendName(e.target.value)}
            placeholder="Friend name (e.g. Aziz, Ines, Karim)..."
            maxLength={28}
            data-testid="add-friend-input"
            className="flex-1 rounded-xl bg-[#090B10] border border-white/[0.1] px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            data-testid="add-friend-submit"
            className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3.5 py-2 text-xs font-bold text-slate-950 active:scale-[0.97] transition-transform shrink-0"
          >
            + Add Friend
          </button>
        </div>
      </form>

      {/* Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {(
          [
            { id: 'all', label: `All (${report.friendsMetrics.length})` },
            { id: 'good', label: '🟢 Good Influence' },
            { id: 'neutral', label: '🟡 Neutral' },
            { id: 'bad', label: '🔴 Bad Influence' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterLevel(tab.id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all active:scale-[0.96] shrink-0 ${
              filterLevel === tab.id
                ? 'bg-white text-slate-950 border-white'
                : 'bg-[#10131C] text-zinc-300 border-white/[0.07] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Friend Influence Cards */}
      <div className="space-y-2.5">
        {filteredFriends.length === 0 ? (
          <div className="rounded-2xl bg-[#10131C] border border-white/[0.06] py-8 text-center text-xs text-zinc-400">
            No friends match this filter yet.
          </div>
        ) : (
          filteredFriends.map((metric) => {
            const badge = getBadgeConfig(metric.effectiveInfluence);
            const diffPct =
              report.medianSocialCph > 0 && metric.hangoutCount > 0
                ? Math.round((metric.ratioToBaseline - 1) * 100)
                : 0;

            return (
              <div
                key={metric.friend.id}
                data-testid={`friend-card-${metric.friend.id}`}
                className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-3.5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl font-bold text-sm text-slate-950 shadow-sm shrink-0"
                      style={{ backgroundColor: metric.friend.avatarColor }}
                    >
                      {metric.friend.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-white">
                          {metric.friend.name}
                        </h3>
                        <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                          ({metric.hangoutCount} hangout
                          {metric.hangoutCount === 1 ? '' : 's'})
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
                        {metric.topCategory ? (
                          <span>
                            Top:{' '}
                            <strong className="text-zinc-200">
                              {metric.topCategory.icon}{' '}
                              {metric.topCategory.name}
                            </strong>{' '}
                            ({formatTND(metric.topCategory.totalSpent)})
                          </span>
                        ) : (
                          <span>No hangouts logged yet</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 1-Tap Hybrid Override Badge */}
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleCycleOverride(metric)}
                      data-testid={`friend-badge-${metric.friend.id}`}
                      title="Tap to cycle: Auto -> Good -> Bad -> Neutral"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold active:scale-[0.95] transition-transform ${badge.bg}`}
                    >
                      <span>{badge.label}</span>
                      <RefreshCcw className="h-2.5 w-2.5 opacity-75" />
                    </button>
                    <span className="text-[10px] text-zinc-400">
                      {metric.isManualOverride ? (
                        <span className="text-amber-300 font-medium">
                          Manual Override (Auto: {metric.autoInfluence})
                        </span>
                      ) : (
                        <span>Auto via CPH</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* 4-Column Friend Stats Strip */}
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#090B10] border border-white/[0.05] p-2.5">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">
                      Total Spent
                    </span>
                    <span className="font-mono text-xs sm:text-sm font-bold text-white tabular-nums">
                      {formatTND(metric.totalSpent)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">
                      Avg / Hangout (CPH)
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-xs sm:text-sm font-bold text-emerald-400 tabular-nums">
                        {formatTND(metric.cph)}
                      </span>
                      {metric.hangoutCount > 0 && (
                        <span
                          className={`font-mono text-[10px] tabular-nums ${
                            diffPct > 20
                              ? 'text-rose-400'
                              : diffPct <= -10
                                ? 'text-emerald-400'
                                : 'text-zinc-400'
                          }`}
                        >
                          ({diffPct > 0 ? `+${diffPct}%` : `${diffPct}%`})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-zinc-400 block">
                        Vibe Check
                      </span>
                      <div className="flex items-center gap-2 mt-0.5 text-xs font-mono tabular-nums">
                        <span className="inline-flex items-center gap-0.5 text-emerald-400">
                          <ThumbsUp className="h-3 w-3" />
                          {metric.worthItCount}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-rose-400">
                          <Skull className="h-3 w-3" />
                          {metric.regretCount}
                        </span>
                      </div>
                    </div>

                    {/* Delete Friend Button */}
                    {confirmDeleteId === metric.friend.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteFriend(
                            metric.friend.id,
                            metric.friend.name
                          )
                        }
                        className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-bold text-white active:scale-[0.95]"
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(metric.friend.id)}
                        aria-label={`Remove ${metric.friend.name}`}
                        className="rounded-lg p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.95]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Combo Duos Spotlight */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Combo Duos (When 2 Friends Together Spike Spend)
            </h3>
          </div>
          <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
        </div>

        {report.comboDuos.length === 0 ? (
          <p className="text-xs text-zinc-400">
            Tag 2 or more friends on the Speed-Pad when hanging out as a group
            to automatically detect high-spend Combo Duos.
          </p>
        ) : (
          <div className="space-y-2">
            {report.comboDuos.map((duo) => (
              <div
                key={duo.pairKey}
                className="flex items-center justify-between gap-2 rounded-xl bg-[#090B10] border border-white/[0.05] px-3 py-2.5"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">
                      {duo.friendA.name} + {duo.friendB.name}
                    </span>
                    {duo.isSpikeDuo ? (
                      <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.2 text-[10px] font-bold text-rose-300">
                        🔴 {duo.ratioToBaseline}x Spike Duo
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.2 text-[10px] font-bold text-emerald-300">
                        🟢 {duo.ratioToBaseline}x Safe Duo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 font-mono tabular-nums">
                    {duo.jointHangoutCount} joint hangout
                    {duo.jointHangoutCount === 1 ? '' : 's'} • Total:{' '}
                    {formatTND(duo.jointSpend)}
                  </p>
                </div>

                <div className="text-right font-mono tabular-nums">
                  <span className="text-[10px] text-zinc-400 block">
                    Duo CPH
                  </span>
                  <span className="text-sm font-bold text-amber-300">
                    {formatTND(duo.jointCph)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
