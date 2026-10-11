'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Zap,
  Users,
  BarChart3,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import {
  AuthorizedIpDevice,
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
import {
  isIpAuthorized,
  normalizeIpAddress,
} from '@/domain/securityEngine';
import { db, ensureDatabaseSeeded } from '@/data/db';
import {
  authorizeIpWithPassword,
  queueAllAuthorizedIpsForSync,
  revokeAuthorizedIp,
  touchAuthorizedIpSession,
  updateAppSettings,
} from '@/data/repository';
import {
  getSyncRuntimeStatus,
  initBackgroundSyncEngine,
  mergeRemoteDataIntoLocal,
  subscribeSyncStatus,
  syncNow,
} from '@/data/syncEngine';
import { UnifiedVaultHeader } from '@/components/vault/UnifiedVaultHeader';
import { SpeedPadLogger } from '@/components/logger/SpeedPadLogger';
import { RecentActivitySheet } from '@/components/feed/RecentActivitySheet';
import { FriendsInfluenceView } from '@/components/friends/FriendsInfluenceView';
import { MetricsDashboardView } from '@/components/metrics/MetricsDashboardView';
import { SettingsSyncView } from '@/components/settings/SettingsSyncView';
import { SecurityPasswordGate } from '@/components/security/SecurityPasswordGate';
import { SecurityDevicesView } from '@/components/security/SecurityDevicesView';

type ActiveTab = 'logger' | 'friends' | 'metrics' | 'security' | 'settings';

const EMPTY_TRANSACTIONS: Transaction[] = [];

export default function KanawitaAppPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('logger');
  const [syncStatus, setSyncStatus] = useState<SyncRuntimeStatus>(
    getSyncRuntimeStatus()
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [detectedRealIp, setDetectedRealIp] = useState<string>('127.0.0.1');
  const [simulatedIp, setSimulatedIp] = useState<string | null>(null);
  const [userAgent, setUserAgent] = useState<string>('');
  const [isIpCheckComplete, setIsIpCheckComplete] = useState<boolean>(false);
  const touchedSessionIpRef = useRef<string | null>(null);

  // Initialize IndexedDB seed, IP detection, Service Worker, and Background MongoDB Sync Engine
  useEffect(() => {
    let cancelled = false;

    if (typeof window !== 'undefined') {
      setUserAgent(navigator.userAgent || '');
    }

    const verifySecuritySession = async () => {
      await ensureDatabaseSeeded();
      try {
        const [localIps, localSettings, ipOutbox] = await Promise.all([
          db.authorizedIps.toArray(),
          db.settings.get('app_settings'),
          db.syncOutbox.where('collection').equals('authorizedIps').toArray(),
        ]);
        const revokedIpIds = ipOutbox
          .filter((item) => item.action === 'delete')
          .map((item) => item.documentId);

        const res = await fetch('/api/security', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'check',
            oldIps: localIps,
            revokedIpIds,
            mongodbUri: localSettings?.mongodbUri || undefined,
            mongodbDbName: localSettings?.mongodbDbName || undefined,
          }),
        });
        if (res.ok && !cancelled) {
          const info = (await res.json()) as {
            ip?: string;
            userAgent?: string;
            configured?: boolean;
            authorizedIps?: AuthorizedIpDevice[];
          };
          if (Array.isArray(info.authorizedIps)) {
            await mergeRemoteDataIntoLocal(
              {
                authorizedIps: info.authorizedIps,
              },
              db,
              { authoritativeAuthorizedIps: true }
            );
          }
          if (info.ip) {
            const cleanIp = normalizeIpAddress(info.ip);
            setDetectedRealIp(cleanIp);
            if (typeof window !== 'undefined') {
              localStorage.setItem('kanawita_last_detected_ip', cleanIp);
            }
          }
          if (info.userAgent && !navigator.userAgent) {
            setUserAgent(info.userAgent);
          }
        }
      } catch {
        // Offline fallback uses last cached IP only when /api/security is unreachable
        if (typeof window !== 'undefined' && !cancelled) {
          const cachedIp = localStorage.getItem('kanawita_last_detected_ip');
          if (cachedIp) {
            setDetectedRealIp(normalizeIpAddress(cachedIp));
          }
        }
      } finally {
        if (!cancelled) {
          setIsIpCheckComplete(true);
        }
      }
    };

    void verifySecuritySession();

    const handleVisibilitySecurityCheck = () => {
      if (document.visibilityState === 'visible') {
        void verifySecuritySession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilitySecurityCheck);

    const cleanupSync = initBackgroundSyncEngine();
    const unsubscribeStatus = subscribeSyncStatus(setSyncStatus);

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignore service worker registration errors in dev
      });
    }

    return () => {
      cancelled = true;
      document.removeEventListener(
        'visibilitychange',
        handleVisibilitySecurityCheck
      );
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
  const authorizedIps = useLiveQuery(() => db.authorizedIps.toArray(), []);

  const effectiveCurrentIp = normalizeIpAddress(
    simulatedIp ?? detectedRealIp
  );

  const isSecurityReady = authorizedIps !== undefined && isIpCheckComplete;

  const isCurrentIpRecognized = useMemo(() => {
    if (!isSecurityReady || !authorizedIps) return false;
    return isIpAuthorized(effectiveCurrentIp, authorizedIps);
  }, [isSecurityReady, effectiveCurrentIp, authorizedIps]);

  // Update lastSeenAt when visiting from an already-recognized IP (without asking for password)
  useEffect(() => {
    if (!isSecurityReady || !isCurrentIpRecognized) return;
    if (touchedSessionIpRef.current === effectiveCurrentIp) return;
    touchedSessionIpRef.current = effectiveCurrentIp;
    void touchAuthorizedIpSession(effectiveCurrentIp, userAgent);
  }, [isSecurityReady, isCurrentIpRecognized, effectiveCurrentIp, userAgent]);

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

  const handleAuthorizeCurrentIp = async (password: string) => {
    const record = await authorizeIpWithPassword({
      password,
      ip: effectiveCurrentIp,
      userAgent,
    });
    touchedSessionIpRef.current = effectiveCurrentIp;

    // Also register old IPs and the newly authorized IP on the server / MongoDB
    void (async () => {
      try {
        const allIps = await db.authorizedIps.toArray();
        await fetch('/api/security', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'authorize',
            password,
            simulatedIp: effectiveCurrentIp,
            oldIps: allIps,
            mongodbUri: settings.mongodbUri || undefined,
            mongodbDbName: settings.mongodbDbName || undefined,
          }),
        });
      } catch {
        // Offline outbox already queued the authorization for MongoDB sync
      }
    })();

    showToast(
      `IP ${record.ip} (${record.deviceName}) recognized & registered!`
    );
  };

  const handleDeleteAuthorizedIp = async (ip: string, deviceName: string) => {
    await revokeAuthorizedIp(ip);

    void fetch('/api/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'revoke',
        targetIp: ip,
        mongodbUri: settings.mongodbUri || undefined,
        mongodbDbName: settings.mongodbDbName || undefined,
      }),
    }).catch(() => {
      // Offline outbox already queued the delete operation
    });

    if (normalizeIpAddress(ip) === effectiveCurrentIp) {
      touchedSessionIpRef.current = null;
      showToast(
        `Deleted current IP ${ip} — session locked until password is entered`
      );
    } else {
      showToast(`Deleted IP ${ip} (${deviceName}) — device access revoked`);
    }
  };

  const handleSyncIpsToMongo = async () => {
    await queueAllAuthorizedIpsForSync();
    const allIps = await db.authorizedIps.toArray();
    await fetch('/api/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'check',
        oldIps: allIps,
        mongodbUri: settings.mongodbUri || undefined,
        mongodbDbName: settings.mongodbDbName || undefined,
      }),
    }).catch(() => {});

    const res = await syncNow({ forcePull: true });
    showToast(
      res.ok
        ? `Registered ${allIps.length} recognized IPs in MongoDB Atlas`
        : `Queued ${allIps.length} recognized IPs in outbox (${res.message})`
    );
  };

  const handleSimulateIpChange = (nextIp: string | null) => {
    setSimulatedIp(nextIp ? normalizeIpAddress(nextIp) : null);
    if (nextIp) {
      showToast(`Switched active IP to ${normalizeIpAddress(nextIp)}`);
    } else {
      showToast(`Restored detected IP (${detectedRealIp})`);
    }
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
          className="fixed top-3 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {toastMessage}
        </div>
      )}

      {/* Security Password Gate: Shown ONLY when signing in from an unrecognized / new IP */}
      {isSecurityReady && !isCurrentIpRecognized && (
        <SecurityPasswordGate
          currentIp={effectiveCurrentIp}
          userAgent={userAgent}
          onAuthorizeSuccess={handleAuthorizeCurrentIp}
        />
      )}

      {/* Protected App Content: Only accessible when current IP is recognized */}
      {isSecurityReady && isCurrentIpRecognized && (
        <>
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

            {activeTab === 'security' && (
              <SecurityDevicesView
                currentIp={effectiveCurrentIp}
                detectedRealIp={detectedRealIp}
                userAgent={userAgent}
                authorizedIps={authorizedIps ?? []}
                syncStatus={syncStatus}
                onDeleteIp={handleDeleteAuthorizedIp}
                onSyncIpsToMongo={handleSyncIpsToMongo}
                onSimulateIpChange={handleSimulateIpChange}
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
            <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 py-1.5">
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
                  <span className="absolute top-1 right-4 h-2 w-2 rounded-full bg-rose-500" />
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
                onClick={() => setActiveTab('security')}
                data-testid="nav-tab-security"
                className={`relative flex flex-col items-center justify-center rounded-xl py-1.5 transition-all active:scale-[0.95] ${
                  activeTab === 'security'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="mt-0.5 text-[10px] font-bold">Security</span>
                {(authorizedIps?.length ?? 0) > 0 && (
                  <span className="absolute top-1 right-3 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-1 text-[8px] font-mono font-bold text-emerald-300 tabular-nums">
                    {authorizedIps?.length}
                  </span>
                )}
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
                <span className="mt-0.5 text-[10px] font-bold">
                  Sync &amp; DB
                </span>
                {syncStatus.outboxCount > 0 && (
                  <span className="absolute top-1 right-3 rounded-full bg-amber-400 px-1 text-[8px] font-mono font-bold text-slate-950">
                    {syncStatus.outboxCount}
                  </span>
                )}
              </button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

