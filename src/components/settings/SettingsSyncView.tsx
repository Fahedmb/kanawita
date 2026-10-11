'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Database,
  RefreshCw,
  Download,
  Upload,
  Bell,
  Trash2,
  Sparkles,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import { AppSettings, SyncRuntimeStatus } from '@/domain/models';
import {
  clearAllTransactions,
  exportFullBackupJson,
  importFullBackupJson,
  queueAllAuthorizedIpsForSync,
  reloadDemoDataset,
  updateAppSettings,
} from '@/data/repository';
import { syncNow } from '@/data/syncEngine';

interface SettingsSyncViewProps {
  settings: AppSettings;
  syncStatus: SyncRuntimeStatus;
  onToast: (message: string) => void;
}

export const SettingsSyncView: React.FC<SettingsSyncViewProps> = ({
  settings,
  syncStatus,
  onToast,
}) => {
  const [mongoUri, setMongoUri] = useState<string>(settings.mongodbUri || '');
  const [mongoDbName, setMongoDbName] = useState<string>(
    settings.mongodbDbName || 'kanawita'
  );
  const [isSyncingManual, setIsSyncingManual] = useState<boolean>(false);
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMongoUri(settings.mongodbUri || '');
    setMongoDbName(settings.mongodbDbName || 'kanawita');
  }, [settings.mongodbUri, settings.mongodbDbName]);

  const handleSaveMongoConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateAppSettings({
      mongodbUri: mongoUri.trim(),
      mongodbDbName: mongoDbName.trim() || 'kanawita',
    });

    if (mongoUri.trim()) {
      setIsSyncingManual(true);
      await queueAllAuthorizedIpsForSync();
      const res = await syncNow({ forcePull: true });
      setIsSyncingManual(false);
      onToast(res.message);
    } else {
      onToast('Saved local-only mode (MongoDB URI cleared)');
    }
  };

  const handleManualSyncNow = async () => {
    setIsSyncingManual(true);
    await queueAllAuthorizedIpsForSync();
    const res = await syncNow({ forcePull: true });
    setIsSyncingManual(false);
    onToast(res.message);
  };

  const handleExportBackup = async () => {
    try {
      const json = await exportFullBackupJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `kanawita-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast('Downloaded full Kanawita JSON backup');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importFullBackupJson(text);
      onToast(
        `Restored ${result.importedTransactions} spendings & ${result.importedFriends} friends!`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Invalid backup file');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleToggleEveningReminder = async () => {
    const nextEnabled = !settings.eveningReminderEnabled;

    if (
      nextEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window
    ) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        onToast('Notification permission was not granted by browser');
        return;
      }
    }

    await updateAppSettings({
      eveningReminderEnabled: nextEnabled,
    });
    onToast(
      nextEnabled
        ? `Evening check-in reminder enabled for ${settings.eveningReminderTime}`
        : 'Evening reminder disabled'
    );
  };

  const handleSendTestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      onToast('Notifications are not supported in this browser');
      return;
    }

    const perm =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (perm !== 'granted') {
      onToast('Please allow notifications first');
      return;
    }

    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification('Kanawita (كنويطة) — Evening Check-In', {
          body: 'Any coffee, taxi, or hangout spendings to log in 2 seconds?',
          icon: '/icons/icon-192.svg',
        });
      } else {
        new Notification('Kanawita (كنويطة) — Evening Check-In', {
          body: 'Any coffee, taxi, or hangout spendings to log in 2 seconds?',
        });
      }
      onToast('Sent test check-in notification!');
    } catch {
      onToast('Notification triggered');
    }
  };

  const handleClearAllTransactions = async () => {
    await clearAllTransactions();
    setConfirmClearAll(false);
    onToast('Cleared all spendings — your 3 vaults & friends are ready!');
  };

  const handleReloadDemo = async () => {
    await reloadDemoDataset();
    onToast('Reloaded Tunisian Dinar demo dataset');
  };

  return (
    <div className="space-y-4">
      {/* Live Sync Status + Outbox Queue Card */}
      <div className="rounded-2xl bg-gradient-to-br from-[#131824] to-[#0D1018] border border-white/[0.08] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">
              Phone Offline DB + MongoDB Atlas Sync
            </h2>
          </div>

          <button
            type="button"
            onClick={handleManualSyncNow}
            disabled={isSyncingManual}
            data-testid="sync-now-button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-bold text-slate-950 active:scale-[0.96] transition-transform disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncingManual ? 'animate-spin' : ''}`}
            />
            <span>{isSyncingManual ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
          <div className="rounded-xl bg-[#090B10] border border-white/[0.06] p-2.5">
            <span className="text-[10px] font-sans uppercase text-zinc-400 block">
              Storage Mode
            </span>
            <span className="mt-1 block font-bold text-emerald-400">
              {syncStatus.isConfigured ? 'Phone + Cloud' : '100% Phone Local'}
            </span>
          </div>
          <div className="rounded-xl bg-[#090B10] border border-white/[0.06] p-2.5">
            <span className="text-[10px] font-sans uppercase text-zinc-400 block">
              Offline Outbox
            </span>
            <span className="mt-1 block font-bold text-white">
              {syncStatus.outboxCount} queued
            </span>
          </div>
          <div className="rounded-xl bg-[#090B10] border border-white/[0.06] p-2.5">
            <span className="text-[10px] font-sans uppercase text-zinc-400 block">
              Last Synced
            </span>
            <span className="mt-1 block font-bold text-zinc-300 truncate">
              {syncStatus.lastSyncedAt
                ? new Date(syncStatus.lastSyncedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Local only'}
            </span>
          </div>
        </div>

        {syncStatus.lastError && (
          <p className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
            Last sync note: {syncStatus.lastError}
          </p>
        )}
      </div>

      {/* MongoDB Atlas URI Configuration Form */}
      <form
        onSubmit={handleSaveMongoConfig}
        className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            MongoDB Atlas Connection (Optional)
          </h3>
          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Works 100% offline without keys
          </span>
        </div>

        <p className="text-xs text-zinc-400">
          Every spending saves immediately to your phone&apos;s IndexedDB and
          queues in <code className="text-zinc-200">syncOutbox</code>. Paste
          your free MongoDB Atlas M0 URI below (or set{' '}
          <code className="text-zinc-200">MONGODB_URI</code> in{' '}
          <code className="text-zinc-200">.env</code>) to automatically flush
          the queue whenever your phone is online.
        </p>

        <div className="space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              MongoDB Atlas URI (mongodb+srv://...)
            </label>
            <input
              type="password"
              value={mongoUri}
              onChange={(e) => setMongoUri(e.target.value)}
              placeholder="mongodb+srv://user:pass@cluster.mongodb.net/"
              className="w-full rounded-xl bg-[#090B10] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Database Name
            </label>
            <input
              type="text"
              value={mongoDbName}
              onChange={(e) => setMongoDbName(e.target.value)}
              placeholder="kanawita"
              className="w-full rounded-xl bg-[#090B10] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] py-2.5 text-xs font-bold text-white active:scale-[0.98] transition-all"
        >
          Save Cloud Sync Settings
        </button>
      </form>

      {/* Evening Local Notification Check-in Reminder */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            <div>
              <h3 className="text-xs font-bold text-white">
                Evening Check-In Reminder
              </h3>
              <p className="text-[11px] text-zinc-400">
                Gentle local phone notification at{' '}
                {settings.eveningReminderTime} to log any missed cash spendings
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleEveningReminder}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-all active:scale-[0.96] ${
              settings.eveningReminderEnabled
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-white/[0.05] text-zinc-300 border-white/[0.1]'
            }`}
          >
            {settings.eveningReminderEnabled ? 'Enabled' : 'Enable'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="time"
            value={settings.eveningReminderTime}
            onChange={(e) =>
              updateAppSettings({ eveningReminderTime: e.target.value })
            }
            className="rounded-xl bg-[#090B10] border border-white/[0.1] px-3 py-1.5 font-mono text-xs text-white"
          />
          <button
            type="button"
            onClick={handleSendTestNotification}
            className="rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-zinc-200 active:scale-[0.96]"
          >
            Send Test Notification
          </button>
        </div>
      </div>

      {/* 1-Tap JSON Export / Import Backup */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            1-Tap Phone Backup (JSON Export / Import)
          </h3>
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleExportBackup}
            data-testid="export-backup-button"
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 py-2.5 text-xs font-bold text-emerald-300 active:scale-[0.97] transition-all"
          >
            <Download className="h-4 w-4" />
            <span>Export JSON Backup</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] py-2.5 text-xs font-bold text-white active:scale-[0.97] transition-all"
          >
            <Upload className="h-4 w-4" />
            <span>Import JSON Backup</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Dataset Reset / Demo Controls */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Dataset Controls
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleReloadDemo}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] py-2.5 text-xs font-semibold text-zinc-200 active:scale-[0.97]"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Reload Demo Data</span>
          </button>

          {confirmClearAll ? (
            <button
              type="button"
              onClick={handleClearAllTransactions}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-500 py-2.5 text-xs font-bold text-white active:scale-[0.97]"
            >
              <span>Confirm Clear All</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 py-2.5 text-xs font-semibold text-rose-300 active:scale-[0.97]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear All Spendings</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
