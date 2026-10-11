import {
  AppSettings,
  AuthorizedIpDevice,
  Friend,
  SpendingCategory,
  SyncOutboxItem,
  SyncRuntimeStatus,
  Transaction,
  VaultAccount,
} from '@/domain/models';
import { db, KanawitaDB } from './db';
import { registerSyncTrigger } from './repository';

type StatusListener = (status: SyncRuntimeStatus) => void;

const listeners = new Set<StatusListener>();

let currentStatus: SyncRuntimeStatus = {
  state: 'local_only',
  outboxCount: 0,
  lastSyncedAt: null,
  lastError: null,
  isConfigured: false,
};

let serverEnvConfigured = false;
let isSyncInProgress = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

const emitStatus = (partial: Partial<SyncRuntimeStatus>): void => {
  currentStatus = { ...currentStatus, ...partial };
  for (const listener of Array.from(listeners)) {
    listener(currentStatus);
  }
};

export const getSyncRuntimeStatus = (): SyncRuntimeStatus => currentStatus;

export const subscribeSyncStatus = (listener: StatusListener): (() => void) => {
  listeners.add(listener);
  listener(currentStatus);
  return () => {
    listeners.delete(listener);
  };
};

export interface SyncApiPullPayload {
  vaults?: VaultAccount[];
  categories?: SpendingCategory[];
  friends?: Friend[];
  transactions?: Transaction[];
  settings?: AppSettings[];
  authorizedIps?: AuthorizedIpDevice[];
}

interface SyncApiResponse {
  ok: boolean;
  configured: boolean;
  flushedCount?: number;
  serverTime?: number;
  error?: string;
  message?: string;
  remoteData?: SyncApiPullPayload;
}

/**
 * Reconciles remote MongoDB documents into local IndexedDB using Last-Write-Wins (updatedAt),
 * while respecting any pending local outbox mutations or deletions.
 */
export const mergeRemoteDataIntoLocal = async (
  remote: SyncApiPullPayload,
  targetDb: KanawitaDB = db,
  options?: { authoritativeAuthorizedIps?: boolean }
): Promise<void> => {
  await targetDb.transaction(
    'rw',
    [
      targetDb.vaults,
      targetDb.categories,
      targetDb.friends,
      targetDb.transactions,
      targetDb.authorizedIps,
      targetDb.settings,
      targetDb.syncOutbox,
    ],
    async () => {
      if (Array.isArray(remote.vaults)) {
        for (const rVault of remote.vaults) {
          const pending = await targetDb.syncOutbox.get(`vaults:${rVault.id}`);
          if (pending) continue;
          const local = await targetDb.vaults.get(rVault.id);
          if (!local || (rVault.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
            await targetDb.vaults.put(rVault);
          }
        }
      }

      if (Array.isArray(remote.categories)) {
        for (const rCat of remote.categories) {
          const pending = await targetDb.syncOutbox.get(`categories:${rCat.id}`);
          if (pending) continue;
          const local = await targetDb.categories.get(rCat.id);
          if (!local) {
            await targetDb.categories.put(rCat);
          }
        }
      }

      if (Array.isArray(remote.friends)) {
        for (const rFriend of remote.friends) {
          const pending = await targetDb.syncOutbox.get(
            `friends:${rFriend.id}`
          );
          if (pending) continue;
          const local = await targetDb.friends.get(rFriend.id);
          if (!local || (rFriend.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
            await targetDb.friends.put(rFriend);
          }
        }
      }

      if (Array.isArray(remote.transactions)) {
        for (const rTx of remote.transactions) {
          const pending = await targetDb.syncOutbox.get(
            `transactions:${rTx.id}`
          );
          if (pending) continue;
          const local = await targetDb.transactions.get(rTx.id);
          if (!local || (rTx.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
            await targetDb.transactions.put(rTx);
          }
        }
      }

      if (Array.isArray(remote.authorizedIps)) {
        for (const rIp of remote.authorizedIps) {
          const pending = await targetDb.syncOutbox.get(
            `authorizedIps:${rIp.id}`
          );
          if (pending) continue;
          const local = await targetDb.authorizedIps.get(rIp.id);
          if (!local || (rIp.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
            await targetDb.authorizedIps.put(rIp);
          }
        }

        // Remove any local IPs that were revoked remotely in MongoDB or /api/security (unless pending in local outbox)
        const settingsDoc = await targetDb.settings.get('app_settings');
        if (
          options?.authoritativeAuthorizedIps ||
          remote.authorizedIps.length > 0 ||
          Boolean(settingsDoc?.lastSyncedAt)
        ) {
          const remoteIds = new Set(remote.authorizedIps.map((r) => r.id));
          const localIps = await targetDb.authorizedIps.toArray();
          for (const localIp of localIps) {
            if (!remoteIds.has(localIp.id)) {
              const pending = await targetDb.syncOutbox.get(
                `authorizedIps:${localIp.id}`
              );
              if (!pending) {
                await targetDb.authorizedIps.delete(localIp.id);
              }
            }
          }
        }
      }
    }
  );
};

/**
 * Refreshes the current outbox count and configuration status from IndexedDB.
 */
export const refreshSyncStateFromLocal = async (
  targetDb: KanawitaDB = db
): Promise<SyncRuntimeStatus> => {
  if (typeof window === 'undefined' && targetDb === db) return currentStatus;

  const [outboxCount, settings] = await Promise.all([
    targetDb.syncOutbox.count(),
    targetDb.settings.get('app_settings'),
  ]);

  const hasLocalUri = Boolean(settings?.mongodbUri?.trim());
  const isConfigured = hasLocalUri || serverEnvConfigured;
  const lastSyncedAt = settings?.lastSyncedAt ?? currentStatus.lastSyncedAt;

  let nextState = currentStatus.state;
  if (!isConfigured) {
    nextState = 'local_only';
  } else if (isSyncInProgress) {
    nextState = 'syncing';
  } else if (outboxCount > 0) {
    nextState = 'queued_offline';
  } else if (lastSyncedAt) {
    nextState = 'synced';
  } else {
    nextState = 'local_only';
  }

  emitStatus({
    state: nextState,
    outboxCount,
    lastSyncedAt,
    isConfigured,
  });

  return currentStatus;
};

/**
 * Flushes all pending items in `db.syncOutbox` to `/api/sync` (MongoDB Atlas)
 * and pulls latest remote documents when online.
 */
export const syncNow = async (
  options?: {
    forcePull?: boolean;
    targetDb?: KanawitaDB;
  }
): Promise<{ ok: boolean; message: string }> => {
  const targetDb = options?.targetDb ?? db;

  if (typeof window === 'undefined' && targetDb === db) {
    return { ok: false, message: 'Server environment' };
  }

  if (isSyncInProgress) {
    return { ok: false, message: 'Sync already in progress' };
  }

  const [outboxItems, settings, localAuthorizedIps] = await Promise.all([
    targetDb.syncOutbox.orderBy('timestamp').toArray(),
    targetDb.settings.get('app_settings'),
    targetDb.authorizedIps.toArray(),
  ]);

  const mongodbUri = settings?.mongodbUri?.trim() || '';
  const mongodbDbName = settings?.mongodbDbName?.trim() || 'kanawita';
  const isConfigured = Boolean(mongodbUri) || serverEnvConfigured;

  if (!isConfigured && !options?.forcePull) {
    emitStatus({
      state: 'local_only',
      outboxCount: outboxItems.length,
      isConfigured: false,
      lastError: null,
    });
    return {
      ok: false,
      message: 'Saved on phone (Add MONGODB_URI in Settings to enable cloud sync)',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emitStatus({
      state: isConfigured ? 'queued_offline' : 'local_only',
      outboxCount: outboxItems.length,
      isConfigured,
    });
    return {
      ok: false,
      message: 'Phone is offline — changes queued in local outbox',
    };
  }

  // On initial sync (`!settings?.lastSyncedAt`), include any local old/seeded IPs so they are registered in MongoDB
  const effectiveOutbox: SyncOutboxItem[] = [...outboxItems];
  if (!settings?.lastSyncedAt && localAuthorizedIps.length > 0) {
    const outboxIds = new Set(outboxItems.map((item) => item.id));
    for (const ipDoc of localAuthorizedIps) {
      const key = `authorizedIps:${ipDoc.id}`;
      if (!outboxIds.has(key)) {
        effectiveOutbox.push({
          id: key,
          collection: 'authorizedIps',
          documentId: ipDoc.id,
          action: 'upsert',
          payload: ipDoc,
          timestamp: ipDoc.updatedAt || Date.now(),
        });
      }
    }
  }

  isSyncInProgress = true;
  emitStatus({
    state: 'syncing',
    outboxCount: outboxItems.length,
    isConfigured: true,
    lastError: null,
  });

  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mongodbUri: mongodbUri || undefined,
        mongodbDbName,
        outbox: effectiveOutbox,
        pullCollections: true,
      }),
    });

    const data = (await response.json()) as SyncApiResponse;
    serverEnvConfigured = Boolean(data.configured);

    if (!response.ok || !data.ok) {
      const errMsg = data.message || data.error || 'MongoDB sync failed';
      isSyncInProgress = false;
      emitStatus({
        state: data.configured ? 'sync_error' : 'local_only',
        outboxCount: outboxItems.length,
        isConfigured: Boolean(mongodbUri) || serverEnvConfigured,
        lastError: data.configured ? errMsg : null,
      });
      return { ok: false, message: errMsg };
    }

    // Remove synced items from outbox only if they were not overwritten by a newer mutation while in-flight
    let actuallyFlushedCount = 0;
    if (outboxItems.length > 0) {
      await targetDb.transaction('rw', [targetDb.syncOutbox], async () => {
        for (const sentItem of outboxItems) {
          const currentInOutbox = await targetDb.syncOutbox.get(sentItem.id);
          if (
            currentInOutbox &&
            currentInOutbox.timestamp <= sentItem.timestamp
          ) {
            await targetDb.syncOutbox.delete(sentItem.id);
            actuallyFlushedCount += 1;
          }
        }
      });
    }

    // Reconcile remote MongoDB state into IndexedDB (skipping any docs with remaining pending outbox entries)
    if (data.remoteData) {
      await mergeRemoteDataIntoLocal(data.remoteData, targetDb);
    }

    const syncedAt = data.serverTime ?? Date.now();
    if (settings) {
      await targetDb.settings.put({
        ...settings,
        lastSyncedAt: syncedAt,
      });
    }

    const remainingOutbox = await targetDb.syncOutbox.count();
    isSyncInProgress = false;
    emitStatus({
      state: remainingOutbox > 0 ? 'queued_offline' : 'synced',
      outboxCount: remainingOutbox,
      lastSyncedAt: syncedAt,
      lastError: null,
      isConfigured: true,
    });

    return {
      ok: true,
      message: `Synced to MongoDB Atlas (${actuallyFlushedCount} item${actuallyFlushedCount === 1 ? '' : 's'} flushed)`,
    };
  } catch (err) {
    isSyncInProgress = false;
    const message =
      err instanceof Error ? err.message : 'Network error during cloud sync';
    const remainingOutbox = await targetDb.syncOutbox.count();
    emitStatus({
      state: isConfigured ? 'queued_offline' : 'local_only',
      outboxCount: remainingOutbox,
      lastError: message,
      isConfigured,
    });
    return { ok: false, message };
  }
};

/**
 * Debounced background sync trigger invoked after local mutations or when coming online.
 */
export const scheduleBackgroundSync = (delayMs = 900): void => {
  if (typeof window === 'undefined') return;
  void refreshSyncStateFromLocal();

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    void syncNow();
  }, delayMs);
};

/**
 * Initializes the background sync manager in the browser:
 * - Checks `/api/sync` health for server-configured `MONGODB_URI`
 * - Hooks into `repository.ts` post-mutation callbacks
 * - Listens to `window.online` and `visibilitychange`
 */
export const initBackgroundSyncEngine = (): (() => void) => {
  if (typeof window === 'undefined' || initialized) {
    return () => {};
  }
  initialized = true;

  registerSyncTrigger(() => {
    scheduleBackgroundSync(750);
  });

  const handleOnline = () => {
    scheduleBackgroundSync(300);
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      void refreshSyncStateFromLocal();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  // Initial check of server env configuration & outbox state
  void (async () => {
    await refreshSyncStateFromLocal();
    try {
      const res = await fetch('/api/sync', { method: 'GET' });
      if (res.ok) {
        const info = (await res.json()) as { configured?: boolean };
        if (info.configured) {
          serverEnvConfigured = true;
          await refreshSyncStateFromLocal();
          void syncNow({ forcePull: true });
        } else {
          const settings = await db.settings.get('app_settings');
          if (settings?.mongodbUri?.trim()) {
            void syncNow({ forcePull: true });
          }
        }
      }
    } catch {
      // Offline on startup — stays in 100% phone local mode
    }
  })();

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    initialized = false;
  };
};
