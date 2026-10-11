'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Zap,
  Users,
  BarChart3,
  Settings,
} from 'lucide-react';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_FRIENDS,
  DEFAULT_SETTINGS,
  DEFAULT_VAULTS,
  SyncRuntimeStatus,
  Transaction,
} from '@/domain/models';
import { computeUnifiedBalance } from '@/domain/balanceEngine';
import { computeFriendInfluence } from '@/domain/influenceEngine';
import {
  computeDashboardMetrics,
  toLocalDateKey,
} from '@/domain/metricsEngine';
import { db, ensureDatabaseSeeded } from '@/data/db';
import { updateAppSettings } from '@/data/repository';
import {
  getSyncRuntimeStatus,
  initBackgroundSyncEngine,
  subscribeSyncStatus,
} from '@/data/syncEngine';
import { UnifiedVaultHeader } from '@/components/vault/UnifiedVaultHeader';
import { SpeedPadLogger } from '@/components/logger/SpeedPadLogger';
import { RecentActivitySheet } from '@/components/feed/RecentActivitySheet';
import { FriendsInfluenceView } from '@/components/friends/FriendsInfluenceView';
import { MetricsDashboardView } from '@/components/metrics/MetricsDashboardView';
import { SettingsSyncView } from '@/components/settings/SettingsSyncView';

type ActiveTab = 'logger' | 'friends' | 'metrics' | 'settings';

const EMPTY_TRANSACTIONS: Transaction[] = [];

export default function KanawitaAppPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('logger');
  const [syncStatus, setSyncStatus] = useState<SyncRuntimeStatus>(
    getSyncRuntimeStatus()
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Initialize IndexedDB seed, Service Worker, and Background MongoDB Sync Engine
  useEffect(() => {
    void ensureDatabaseSeeded();
    const cleanupSync = initBackgroundSyncEngine();
    const unsubscribeStatus = subscribeSyncStatus(setSyncStatus);

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignore service worker registration errors in dev
      });
    }

    return () => {
      cleanupSync();
      unsubscribeStatus();
    };
  }, []);

  // Reactive 0ms queries from local IndexedDB
  const vaults =
    useLiveQuery(() => db.vaults.toArray(), [], DEFAULT_VAULTS) ??
    DEFAULT_VAULTS;
  const categories =
    useLiveQuery(() => db.categories.toArray(), [], DEFAULT_CATEGORIES) ??
    DEFAULT_CATEGORIES;
  const friends =
    useLiveQuery(() => db.friends.toArray(), [], DEFAULT_FRIENDS) ??
    DEFAULT_FRIENDS;
  const transactions =
    useLiveQuery(() => db.transactions.toArray(), [], EMPTY_TRANSACTIONS) ??
    EMPTY_TRANSACTIONS;
  const settings =
    useLiveQuery(
      () => db.settings.get('app_settings'),
      [],
      DEFAULT_SETTINGS
    ) ?? DEFAULT_SETTINGS;

  // Evening Local Notification Reminder scheduler
  useEffect(() => {
    if (!settings.eveningReminderEnabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const interval = setInterval(() => {
      if (Notification.permission !== 'granted') return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      const todayKey = toLocalDateKey(now.getTime());
      const storageKey = `kanawita_reminded_${todayKey}`;

      if (
        hhmm === settings.eveningReminderTime &&
        !localStorage.getItem(storageKey)
      ) {
        localStorage.setItem(storageKey, '1');
        new Notification('Kanawita (كنويطة) — Evening Check-In', {
          body: 'Any coffee, transport, or friend hangouts to log in 2 seconds?',
        });
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [settings.eveningReminderEnabled, settings.eveningReminderTime]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  // Pure domain engines
  const balanceSummary = useMemo(
    () => computeUnifiedBalance(vaults, transactions),
    [vaults, transactions]
  );

  const influenceReport = useMemo(
    () => computeFriendInfluence(friends, transactions, categories),
    [friends, transactions, categories]
  );

  const friendMetricsMap = useMemo(
    () =>
      new Map(
        influenceReport.friendsMetrics.map((m) => [m.friend.id, m] as const)
      ),
    [influenceReport]
  );

  const dashboardMetrics = useMemo(
    () =>
      computeDashboardMetrics(transactions, categories, {
        includeMonthlyBills: settings.includeMonthlyBillsInMetrics,
      }),
    [transactions, categories, settings.includeMonthlyBillsInMetrics]
  );

  const handleToggleMonthlyBills = async (nextInclude: boolean) => {
    await updateAppSettings({ includeMonthlyBillsInMetrics: nextInclude });
    showToast(
      nextInclude
        ? 'Monthly fixed bills included in dashboard metrics'
        : 'Monthly fixed bills excluded — pure daily spending view'
    );
  };

  const badInfluenceCount = useMemo(
    () =>
      influenceReport.friendsMetrics.filter(
        (f) => f.effectiveInfluence === 'bad'
      ).length,
    [influenceReport]
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-3 pt-3 pb-24">
      {/* Global Feedback Toast */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {toastMessage}
        </div>
      )}

      {/* Always-On Unified Total Money Pool + 3 Reference Vaults Header */}
      <UnifiedVaultHeader
        balanceSummary={balanceSummary}
        syncStatus={syncStatus}
        onOpenSettingsTab={() => setActiveTab('settings')}
        onToast={showToast}
      />

      {/* Main Tab View Content */}
      <main className="mt-3 flex-1 space-y-3">
        {activeTab === 'logger' && (
          <>
            <SpeedPadLogger
              categories={categories}
              friends={friends}
              friendMetricsMap={friendMetricsMap}
            />
            <RecentActivitySheet
              transactions={transactions}
              categories={categories}
              friends={friends}
              compactLimit={12}
            />
          </>
        )}

        {activeTab === 'friends' && (
          <FriendsInfluenceView
            report={influenceReport}
            onToast={showToast}
          />
        )}

        {activeTab === 'metrics' && (
          <MetricsDashboardView
            metrics={dashboardMetrics}
            onToggleMonthlyBills={handleToggleMonthlyBills}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsSyncView
            settings={settings}
            syncStatus={syncStatus}
            onToast={showToast}
          />
        )}
      </main>

      {/* Bottom Tactile Mobile Tab Bar */}
      <nav
        aria-label="Primary Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] bg-[#090B10]/95 backdrop-blur-md"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('logger')}
            data-testid="nav-tab-logger"
            className={`flex flex-col items-center justify-center rounded-xl py-1.5 transition-all active:scale-[0.95] ${
              activeTab === 'logger'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Zap className="h-4 w-4" />
            <span className="mt-0.5 text-[10px] font-bold">Speed-Pad</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('friends')}
            data-testid="nav-tab-friends"
            className={`relative flex flex-col items-center justify-center rounded-xl py-1.5 transition-all active:scale-[0.95] ${
              activeTab === 'friends'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="h-4 w-4" />
            <span className="mt-0.5 text-[10px] font-bold">Friends</span>
            {badInfluenceCount > 0 && (
              <span className="absolute top-1 right-5 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('metrics')}
            data-testid="nav-tab-metrics"
            className={`flex flex-col items-center justify-center rounded-xl py-1.5 transition-all active:scale-[0.95] ${
              activeTab === 'metrics'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span className="mt-0.5 text-[10px] font-bold">Metrics</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            data-testid="nav-tab-settings"
            className={`relative flex flex-col items-center justify-center rounded-xl py-1.5 transition-all active:scale-[0.95] ${
              activeTab === 'settings'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span className="mt-0.5 text-[10px] font-bold">Sync &amp; DB</span>
            {syncStatus.outboxCount > 0 && (
              <span className="absolute top-1 right-4 rounded-full bg-amber-400 px-1 text-[8px] font-mono font-bold text-slate-950">
                {syncStatus.outboxCount}
              </span>
            )}
          </button>
        </div>
      </nav>
    </div>
  );
}
