import {
  AppSettings,
  AuthorizedIpDevice,
  DEFAULT_CATEGORIES,
  DEFAULT_FRIENDS,
  DEFAULT_SETTINGS,
  DEFAULT_VAULTS,
  Friend,
  FRIEND_AVATAR_COLORS,
  InfluenceLevel,
  SpendingCategory,
  SyncCollectionName,
  SyncOutboxItem,
  Transaction,
  TransactionVibe,
  VaultAccount,
  VaultId,
} from '@/domain/models';
import { roundTND } from '@/domain/formatTND';
import { cycleManualOverride } from '@/domain/influenceEngine';
import {
  ipToDocumentId,
  normalizeIpAddress,
  parseDeviceFromUserAgent,
  verifySecurityPassword,
} from '@/domain/securityEngine';
import { buildInitialSeedTransactions, db, KanawitaDB } from './db';

type SyncTriggerCallback = () => void;
let onMutationSyncTrigger: SyncTriggerCallback | null = null;

export const registerSyncTrigger = (cb: SyncTriggerCallback): void => {
  onMutationSyncTrigger = cb;
};

const notifySyncTrigger = (): void => {
  if (onMutationSyncTrigger) {
    try {
      onMutationSyncTrigger();
    } catch {
      // Ignore background trigger errors
    }
  }
};

const createId = (prefix: string): string => {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
};

const enqueueOutboxItem = async (
  targetDb: KanawitaDB,
  collection: SyncCollectionName,
  documentId: string,
  action: 'upsert' | 'delete',
  payload: unknown,
  timestamp = Date.now()
): Promise<void> => {
  const item: SyncOutboxItem = {
    id: `${collection}:${documentId}`,
    collection,
    documentId,
    action,
    payload,
    timestamp,
  };
  await targetDb.syncOutbox.put(item);
};

export interface LogSpendingInput {
  amount: number;
  categoryId: string;
  friendIds?: string[];
  vibe?: TransactionVibe;
  note?: string;
  timestamp?: number;
}

/**
 * 2-Second Instant-Save Logger mutation:
 * Atomically writes the new spending transaction to IndexedDB and queues it in syncOutbox.
 */
export const logSpendingInstant = async (
  input: LogSpendingInput,
  targetDb: KanawitaDB = db
): Promise<Transaction> => {
  const cleanAmount = roundTND(input.amount);
  if (cleanAmount <= 0) {
    throw new Error('Spending amount must be greater than 0 DT');
  }

  const now = input.timestamp ?? Date.now();
  const tx: Transaction = {
    id: createId('tx'),
    type: 'spending',
    amount: cleanAmount,
    categoryId: input.categoryId,
    friendIds: Array.from(new Set(input.friendIds ?? [])),
    vibe: input.vibe ?? null,
    note: input.note?.trim() || undefined,
    countInBalanceOffset: true,
    timestamp: now,
    updatedAt: now,
    deletedAt: null,
  };

  await targetDb.transaction(
    'rw',
    [targetDb.transactions, targetDb.syncOutbox],
    async () => {
      await targetDb.transactions.put(tx);
      await enqueueOutboxItem(
        targetDb,
        'transactions',
        tx.id,
        'upsert',
        tx,
        now
      );
    }
  );

  notifySyncTrigger();
  return tx;
};

/**
 * Soft-deletes a transaction (used by the 5-second Undo toast and Recent Activity delete button).
 */
export const softDeleteTransaction = async (
  transactionId: string,
  targetDb: KanawitaDB = db
): Promise<Transaction | null> => {
  let updatedTx: Transaction | null = null;
  const now = Date.now();

  await targetDb.transaction(
    'rw',
    [targetDb.transactions, targetDb.syncOutbox],
    async () => {
      const existing = await targetDb.transactions.get(transactionId);
      if (!existing) return;
      updatedTx = {
        ...existing,
        deletedAt: now,
        updatedAt: now,
      };
      await targetDb.transactions.put(updatedTx);
      await enqueueOutboxItem(
        targetDb,
        'transactions',
        updatedTx.id,
        'upsert',
        updatedTx,
        now
      );
    }
  );

  if (updatedTx) notifySyncTrigger();
  return updatedTx;
};

/**
 * Restores a soft-deleted transaction.
 */
export const restoreTransaction = async (
  transactionId: string,
  targetDb: KanawitaDB = db
): Promise<Transaction | null> => {
  let restoredTx: Transaction | null = null;
  const now = Date.now();

  await targetDb.transaction(
    'rw',
    [targetDb.transactions, targetDb.syncOutbox],
    async () => {
      const existing = await targetDb.transactions.get(transactionId);
      if (!existing) return;
      restoredTx = {
        ...existing,
        deletedAt: null,
        updatedAt: now,
      };
      await targetDb.transactions.put(restoredTx);
      await enqueueOutboxItem(
        targetDb,
        'transactions',
        restoredTx.id,
        'upsert',
        restoredTx,
        now
      );
    }
  );

  if (restoredTx) notifySyncTrigger();
  return restoredTx;
};

export interface UpdateVaultBalanceInput {
  vaultId: VaultId;
  mode: 'add' | 'subtract' | 'set';
  amount: number;
  clearSpendingOffset?: boolean;
  note?: string;
}

/**
 * Updates one of the 3 reference vaults (`Bank (UIB)`, `Savings`, `Post Office (D17)`).
 * Optionally clears `countInBalanceOffset` on past spendings when syncing real bank balances
 * so historical metrics remain 100% intact while the new vault balances become the fresh baseline.
 */
export const updateVaultBalance = async (
  input: UpdateVaultBalanceInput,
  targetDb: KanawitaDB = db
): Promise<VaultAccount> => {
  const cleanAmount = roundTND(Math.max(0, input.amount));
  const now = Date.now();
  let updatedVault!: VaultAccount;

  await targetDb.transaction(
    'rw',
    [
      targetDb.vaults,
      targetDb.transactions,
      targetDb.settings,
      targetDb.syncOutbox,
    ],
    async () => {
      const existing = await targetDb.vaults.get(input.vaultId);
      if (!existing) {
        throw new Error(`Vault ${input.vaultId} not found`);
      }

      let nextBalance = existing.balance;
      if (input.mode === 'add') {
        nextBalance = roundTND(existing.balance + cleanAmount);
      } else if (input.mode === 'subtract') {
        nextBalance = roundTND(Math.max(0, existing.balance - cleanAmount));
      } else if (input.mode === 'set') {
        nextBalance = cleanAmount;
      }

      updatedVault = {
        ...existing,
        balance: nextBalance,
        updatedAt: now,
      };

      await targetDb.vaults.put(updatedVault);
      await enqueueOutboxItem(
        targetDb,
        'vaults',
        updatedVault.id,
        'upsert',
        updatedVault,
        now
      );

      if (input.clearSpendingOffset) {
        const allOffsetTxs = await targetDb.transactions
          .filter((tx) => tx.countInBalanceOffset && !tx.deletedAt)
          .toArray();

        for (const tx of allOffsetTxs) {
          const cleared: Transaction = {
            ...tx,
            countInBalanceOffset: false,
            updatedAt: now,
          };
          await targetDb.transactions.put(cleared);
          await enqueueOutboxItem(
            targetDb,
            'transactions',
            cleared.id,
            'upsert',
            cleared,
            now
          );
        }

        const currentSettings =
          (await targetDb.settings.get('app_settings')) ?? DEFAULT_SETTINGS;
        const nextSettings: AppSettings = {
          ...currentSettings,
          lastVaultResetAt: now,
          updatedAt: now,
        };
        await targetDb.settings.put(nextSettings);
        await enqueueOutboxItem(
          targetDb,
          'settings',
          nextSettings.id,
          'upsert',
          nextSettings,
          now
        );
      }
    }
  );

  notifySyncTrigger();
  return updatedVault;
};

/**
 * Absorbs/resets all active spending offsets into the current 3 vault balances
 * without deleting any historical transactions or metrics.
 */
export const clearAllSpendingOffsets = async (
  targetDb: KanawitaDB = db
): Promise<number> => {
  const now = Date.now();
  let clearedCount = 0;

  await targetDb.transaction(
    'rw',
    [targetDb.transactions, targetDb.settings, targetDb.syncOutbox],
    async () => {
      const offsetTxs = await targetDb.transactions
        .filter((tx) => tx.countInBalanceOffset && !tx.deletedAt)
        .toArray();

      clearedCount = offsetTxs.length;

      for (const tx of offsetTxs) {
        const updated: Transaction = {
          ...tx,
          countInBalanceOffset: false,
          updatedAt: now,
        };
        await targetDb.transactions.put(updated);
        await enqueueOutboxItem(
          targetDb,
          'transactions',
          updated.id,
          'upsert',
          updated,
          now
        );
      }

      const currentSettings =
        (await targetDb.settings.get('app_settings')) ?? DEFAULT_SETTINGS;
      const nextSettings: AppSettings = {
        ...currentSettings,
        lastVaultResetAt: now,
        updatedAt: now,
      };
      await targetDb.settings.put(nextSettings);
      await enqueueOutboxItem(
        targetDb,
        'settings',
        nextSettings.id,
        'upsert',
        nextSettings,
        now
      );
    }
  );

  if (clearedCount > 0) notifySyncTrigger();
  return clearedCount;
};

/**
 * Adds a new friend to the friend list.
 */
export const addFriend = async (
  name: string,
  avatarColor?: string,
  targetDb: KanawitaDB = db
): Promise<Friend> => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Friend name cannot be empty');
  }

  const now = Date.now();
  const existingCount = await targetDb.friends.count();
  const color =
    avatarColor ??
    FRIEND_AVATAR_COLORS[existingCount % FRIEND_AVATAR_COLORS.length];

  const friend: Friend = {
    id: createId('friend'),
    name: trimmed,
    avatarColor: color,
    manualOverride: null,
    createdAt: now,
    updatedAt: now,
  };

  await targetDb.transaction(
    'rw',
    [targetDb.friends, targetDb.syncOutbox],
    async () => {
      await targetDb.friends.put(friend);
      await enqueueOutboxItem(
        targetDb,
        'friends',
        friend.id,
        'upsert',
        friend,
        now
      );
    }
  );

  notifySyncTrigger();
  return friend;
};

/**
 * Removes a friend and untags them from transactions.
 */
export const removeFriend = async (
  friendId: string,
  targetDb: KanawitaDB = db
): Promise<void> => {
  const now = Date.now();

  await targetDb.transaction(
    'rw',
    [targetDb.friends, targetDb.transactions, targetDb.syncOutbox],
    async () => {
      await targetDb.friends.delete(friendId);
      await enqueueOutboxItem(
        targetDb,
        'friends',
        friendId,
        'delete',
        { id: friendId, deletedAt: now },
        now
      );

      const taggedTxs = await targetDb.transactions
        .filter((tx) => tx.friendIds.includes(friendId))
        .toArray();

      for (const tx of taggedTxs) {
        const updated: Transaction = {
          ...tx,
          friendIds: tx.friendIds.filter((id) => id !== friendId),
          updatedAt: now,
        };
        await targetDb.transactions.put(updated);
        await enqueueOutboxItem(
          targetDb,
          'transactions',
          updated.id,
          'upsert',
          updated,
          now
        );
      }
    }
  );

  notifySyncTrigger();
};

/**
 * Cycles a friend's manual influence override:
 * Auto (null) -> Good ('good') -> Bad ('bad') -> Neutral ('neutral') -> Auto (null)
 */
export const cycleFriendInfluenceOverride = async (
  friendId: string,
  targetDb: KanawitaDB = db
): Promise<InfluenceLevel | null> => {
  const now = Date.now();
  let nextOverride: InfluenceLevel | null = null;

  await targetDb.transaction(
    'rw',
    [targetDb.friends, targetDb.syncOutbox],
    async () => {
      const friend = await targetDb.friends.get(friendId);
      if (!friend) throw new Error('Friend not found');

      nextOverride = cycleManualOverride(friend.manualOverride);
      const updated: Friend = {
        ...friend,
        manualOverride: nextOverride,
        updatedAt: now,
      };
      await targetDb.friends.put(updated);
      await enqueueOutboxItem(
        targetDb,
        'friends',
        updated.id,
        'upsert',
        updated,
        now
      );
    }
  );

  notifySyncTrigger();
  return nextOverride;
};

/**
 * Updates app settings (such as "Include/Exclude Monthly Fixed Bills", MongoDB URI, or evening reminder).
 */
export const updateAppSettings = async (
  partial: Partial<Omit<AppSettings, 'id'>>,
  targetDb: KanawitaDB = db
): Promise<AppSettings> => {
  const now = Date.now();
  let nextSettings!: AppSettings;

  await targetDb.transaction(
    'rw',
    [targetDb.settings, targetDb.syncOutbox],
    async () => {
      const current =
        (await targetDb.settings.get('app_settings')) ?? DEFAULT_SETTINGS;
      nextSettings = {
        ...current,
        ...partial,
        id: 'app_settings',
        updatedAt: now,
      };
      await targetDb.settings.put(nextSettings);
      await enqueueOutboxItem(
        targetDb,
        'settings',
        nextSettings.id,
        'upsert',
        nextSettings,
        now
      );
    }
  );

  notifySyncTrigger();
  return nextSettings;
};

export interface KanawitaBackupBundle {
  version: number;
  exportedAt: number;
  vaults: VaultAccount[];
  categories: SpendingCategory[];
  friends: Friend[];
  transactions: Transaction[];
  settings: AppSettings;
  authorizedIps?: AuthorizedIpDevice[];
}

/**
 * Exports all phone data as a formatted JSON string for 1-tap backup.
 */
export const exportFullBackupJson = async (
  targetDb: KanawitaDB = db
): Promise<string> => {
  const [vaults, categories, friends, transactions, settingsDoc, authorizedIps] =
    await Promise.all([
      targetDb.vaults.toArray(),
      targetDb.categories.toArray(),
      targetDb.friends.toArray(),
      targetDb.transactions.toArray(),
      targetDb.settings.get('app_settings'),
      targetDb.authorizedIps.toArray(),
    ]);

  const bundle: KanawitaBackupBundle = {
    version: 2,
    exportedAt: Date.now(),
    vaults,
    categories,
    friends,
    transactions,
    settings: settingsDoc ?? DEFAULT_SETTINGS,
    authorizedIps,
  };

  return JSON.stringify(bundle, null, 2);
};

/**
 * Restores a JSON backup bundle into local IndexedDB and queues all restored items for sync.
 */
export const importFullBackupJson = async (
  rawJson: string,
  targetDb: KanawitaDB = db
): Promise<{ importedTransactions: number; importedFriends: number }> => {
  let parsed: Partial<KanawitaBackupBundle>;
  try {
    parsed = JSON.parse(rawJson) as Partial<KanawitaBackupBundle>;
  } catch {
    throw new Error('Invalid JSON backup file');
  }

  if (
    !parsed ||
    !Array.isArray(parsed.vaults) ||
    !Array.isArray(parsed.transactions)
  ) {
    throw new Error(
      'Backup file is missing required Kanawita vaults or transactions arrays'
    );
  }

  const now = Date.now();

  // Guarantee all 3 reference vaults exist even if partial vaults array was provided
  const importedVaultMap = new Map<VaultId, VaultAccount>(
    parsed.vaults
      .filter((v): v is VaultAccount => Boolean(v && v.id))
      .map((v) => [v.id, v])
  );
  const vaultsToImport: VaultAccount[] = DEFAULT_VAULTS.map(
    (def) => importedVaultMap.get(def.id) ?? def
  );

  // Guarantee all 10 default categories exist alongside any custom categories
  const importedCatMap = new Map<string, SpendingCategory>(
    DEFAULT_CATEGORIES.map((c) => [c.id, c])
  );
  if (Array.isArray(parsed.categories)) {
    for (const cat of parsed.categories) {
      if (cat && cat.id) {
        importedCatMap.set(cat.id, cat);
      }
    }
  }
  const categoriesToImport = Array.from(importedCatMap.values());

  const friendsToImport = Array.isArray(parsed.friends) ? parsed.friends : [];
  const txsToImport = parsed.transactions;

  const importedFriendIds = new Set(friendsToImport.map((f) => f.id));
  const importedTxIds = new Set(txsToImport.map((t) => t.id));

  await targetDb.transaction(
    'rw',
    [
      targetDb.vaults,
      targetDb.categories,
      targetDb.friends,
      targetDb.transactions,
      targetDb.settings,
      targetDb.authorizedIps,
      targetDb.syncOutbox,
    ],
    async () => {
      const [existingFriends, existingTxs, existingAuthorizedIps, existingIpOutbox] =
        await Promise.all([
          targetDb.friends.toArray(),
          targetDb.transactions.toArray(),
          targetDb.authorizedIps.toArray(),
          targetDb.syncOutbox
            .where('collection')
            .equals('authorizedIps')
            .toArray(),
        ]);

      // Clear any stale pre-import outbox items so replaced local mutations aren't flushed
      await targetDb.syncOutbox.clear();

      for (const oldFriend of existingFriends) {
        if (!importedFriendIds.has(oldFriend.id)) {
          await enqueueOutboxItem(
            targetDb,
            'friends',
            oldFriend.id,
            'delete',
            { id: oldFriend.id, deletedAt: now },
            now
          );
        }
      }

      for (const oldTx of existingTxs) {
        if (!importedTxIds.has(oldTx.id)) {
          await enqueueOutboxItem(
            targetDb,
            'transactions',
            oldTx.id,
            'delete',
            { id: oldTx.id, deletedAt: now },
            now
          );
        }
      }

      await targetDb.vaults.clear();
      await targetDb.vaults.bulkPut(vaultsToImport);
      for (const v of vaultsToImport) {
        await enqueueOutboxItem(targetDb, 'vaults', v.id, 'upsert', v, now);
      }

      await targetDb.categories.clear();
      await targetDb.categories.bulkPut(categoriesToImport);

      await targetDb.friends.clear();
      await targetDb.friends.bulkPut(friendsToImport);
      for (const f of friendsToImport) {
        await enqueueOutboxItem(targetDb, 'friends', f.id, 'upsert', f, now);
      }

      await targetDb.transactions.clear();
      await targetDb.transactions.bulkPut(txsToImport);
      for (const tx of txsToImport) {
        await enqueueOutboxItem(
          targetDb,
          'transactions',
          tx.id,
          'upsert',
          tx,
          now
        );
      }

      if (Array.isArray(parsed.authorizedIps)) {
        const importedIpIds = new Set(parsed.authorizedIps.map((ip) => ip.id));
        for (const oldIpDoc of existingAuthorizedIps) {
          if (!importedIpIds.has(oldIpDoc.id)) {
            await enqueueOutboxItem(
              targetDb,
              'authorizedIps',
              oldIpDoc.id,
              'delete',
              { id: oldIpDoc.id, ip: oldIpDoc.ip, deletedAt: now },
              now
            );
          }
        }
        await targetDb.authorizedIps.clear();
        await targetDb.authorizedIps.bulkPut(parsed.authorizedIps);
        for (const ipDoc of parsed.authorizedIps) {
          await enqueueOutboxItem(
            targetDb,
            'authorizedIps',
            ipDoc.id,
            'upsert',
            ipDoc,
            now
          );
        }
      } else if (existingIpOutbox.length > 0) {
        await targetDb.syncOutbox.bulkPut(existingIpOutbox);
      }

      if (parsed.settings) {
        const currentSettings =
          (await targetDb.settings.get('app_settings')) ?? DEFAULT_SETTINGS;
        const mergedSettings: AppSettings = {
          ...currentSettings,
          ...parsed.settings,
          // Keep existing MongoDB URI if the backup had it blank
          mongodbUri:
            parsed.settings.mongodbUri || currentSettings.mongodbUri || '',
          id: 'app_settings',
          updatedAt: now,
        };
        await targetDb.settings.put(mergedSettings);
        await enqueueOutboxItem(
          targetDb,
          'settings',
          mergedSettings.id,
          'upsert',
          mergedSettings,
          now
        );
      }
    }
  );

  notifySyncTrigger();
  return {
    importedTransactions: txsToImport.length,
    importedFriends: friendsToImport.length,
  };
};

export interface AuthorizeIpInput {
  password: string;
  ip: string;
  userAgent?: string;
  locationHint?: string;
  isInitialSignup?: boolean;
}

/**
 * Verifies the security password (`61854`) and registers the IP + device in `db.authorizedIps`
 * and queues all recognized IPs (old IPs + new IP) into `db.syncOutbox` for MongoDB Atlas storage.
 */
export const authorizeIpWithPassword = async (
  input: AuthorizeIpInput,
  targetDb: KanawitaDB = db
): Promise<AuthorizedIpDevice> => {
  if (!verifySecurityPassword(input.password)) {
    throw new Error('Invalid security password');
  }

  const normalizedIp = normalizeIpAddress(input.ip);
  const docId = ipToDocumentId(normalizedIp);
  const parsedDevice = parseDeviceFromUserAgent(input.userAgent);
  const now = Date.now();
  let authorizedRecord!: AuthorizedIpDevice;

  await targetDb.transaction(
    'rw',
    [targetDb.authorizedIps, targetDb.syncOutbox],
    async () => {
      const existing = await targetDb.authorizedIps.get(docId);
      const allExisting = await targetDb.authorizedIps.toArray();
      const hasInitialSignup = allExisting.some((item) => item.isInitialSignup);

      authorizedRecord = {
        id: docId,
        ip: normalizedIp,
        deviceName: parsedDevice.deviceName,
        os: parsedDevice.os,
        browser: parsedDevice.browser,
        deviceType: parsedDevice.deviceType,
        userAgent: input.userAgent || existing?.userAgent || '',
        locationHint:
          input.locationHint ??
          existing?.locationHint ??
          (normalizedIp === '127.0.0.1'
            ? 'Localhost • Direct Device'
            : 'Verified IP Session'),
        isInitialSignup:
          existing?.isInitialSignup ??
          input.isInitialSignup ??
          !hasInitialSignup,
        recognized: true,
        createdAt: existing?.createdAt ?? now,
        lastSeenAt: now,
        signInCount: (existing?.signInCount ?? 0) + 1,
        updatedAt: now,
      };

      await targetDb.authorizedIps.put(authorizedRecord);

      // Register both existing old IPs and the newly authorized IP in MongoDB outbox
      for (const oldIpDoc of allExisting) {
        if (oldIpDoc.id !== docId) {
          await enqueueOutboxItem(
            targetDb,
            'authorizedIps',
            oldIpDoc.id,
            'upsert',
            oldIpDoc,
            oldIpDoc.updatedAt || now
          );
        }
      }

      await enqueueOutboxItem(
        targetDb,
        'authorizedIps',
        authorizedRecord.id,
        'upsert',
        authorizedRecord,
        now
      );
    }
  );

  notifySyncTrigger();
  return authorizedRecord;
};

/**
 * Updates `lastSeenAt` for an already-recognized IP address without requiring a password,
 * while preserving the device metadata recorded when that IP signed up.
 */
export const touchAuthorizedIpSession = async (
  ip: string,
  userAgent?: string,
  targetDb: KanawitaDB = db
): Promise<AuthorizedIpDevice | null> => {
  const normalizedIp = normalizeIpAddress(ip);
  const docId = ipToDocumentId(normalizedIp);
  const now = Date.now();
  let updated: AuthorizedIpDevice | null = null;

  await targetDb.transaction(
    'rw',
    [targetDb.authorizedIps, targetDb.syncOutbox],
    async () => {
      const existing = await targetDb.authorizedIps.get(docId);
      if (!existing || !existing.recognized) return;

      const parsed = userAgent ? parseDeviceFromUserAgent(userAgent) : null;
      updated = {
        ...existing,
        deviceName: existing.deviceName || parsed?.deviceName || 'Desktop • Browser',
        os: existing.os || parsed?.os || 'Desktop OS',
        browser: existing.browser || parsed?.browser || 'Browser',
        deviceType: existing.deviceType || parsed?.deviceType || 'desktop',
        userAgent: existing.userAgent || userAgent || '',
        lastSeenAt: now,
        updatedAt: now,
      };

      await targetDb.authorizedIps.put(updated);
      await enqueueOutboxItem(
        targetDb,
        'authorizedIps',
        updated.id,
        'upsert',
        updated,
        now
      );
    }
  );

  if (updated) notifySyncTrigger();
  return updated;
};

/**
 * Deletes/revokes an IP from `db.authorizedIps` and queues a `delete` operation for MongoDB Atlas,
 * preventing any user on that IP from accessing the app without re-entering the password.
 */
export const revokeAuthorizedIp = async (
  ipOrId: string,
  targetDb: KanawitaDB = db
): Promise<string | null> => {
  const now = Date.now();
  let revokedIp: string | null = null;

  await targetDb.transaction(
    'rw',
    [targetDb.authorizedIps, targetDb.syncOutbox],
    async () => {
      const directById = await targetDb.authorizedIps.get(ipOrId);
      const normalizedIp = normalizeIpAddress(ipOrId);
      const derivedId = ipToDocumentId(normalizedIp);
      const target =
        directById ??
        (await targetDb.authorizedIps.get(derivedId)) ??
        (await targetDb.authorizedIps
          .filter((d) => normalizeIpAddress(d.ip) === normalizedIp)
          .first());

      const deleteId = target?.id ?? derivedId;
      revokedIp = target?.ip ?? normalizedIp;

      await targetDb.authorizedIps.delete(deleteId);
      await enqueueOutboxItem(
        targetDb,
        'authorizedIps',
        deleteId,
        'delete',
        { id: deleteId, ip: revokedIp, deletedAt: now },
        now
      );
    }
  );

  notifySyncTrigger();
  return revokedIp;
};

/**
 * Enqueues all locally recognized IPs into `syncOutbox` so historical/old IPs are registered in MongoDB.
 */
export const queueAllAuthorizedIpsForSync = async (
  targetDb: KanawitaDB = db
): Promise<number> => {
  const now = Date.now();
  let count = 0;

  await targetDb.transaction(
    'rw',
    [targetDb.authorizedIps, targetDb.syncOutbox],
    async () => {
      const all = await targetDb.authorizedIps.toArray();
      count = all.length;
      for (const item of all) {
        const existingOutbox = await targetDb.syncOutbox.get(
          `authorizedIps:${item.id}`
        );
        if (!existingOutbox) {
          await enqueueOutboxItem(
            targetDb,
            'authorizedIps',
            item.id,
            'upsert',
            item,
            item.updatedAt || now
          );
        }
      }
    }
  );

  if (count > 0) notifySyncTrigger();
  return count;
};

/**
 * Clears all spendings so the user can start with a fresh 0-spending log while keeping their 3 vaults and friends.
 */
export const clearAllTransactions = async (
  targetDb: KanawitaDB = db
): Promise<void> => {
  await targetDb.transaction(
    'rw',
    [targetDb.transactions, targetDb.syncOutbox],
    async () => {
      const allTxs = await targetDb.transactions.toArray();
      const now = Date.now();
      await targetDb.transactions.clear();
      for (const tx of allTxs) {
        await enqueueOutboxItem(
          targetDb,
          'transactions',
          tx.id,
          'delete',
          { id: tx.id, deletedAt: now },
          now
        );
      }
    }
  );
  notifySyncTrigger();
};

/**
 * Resets/reloads the realistic Tunisian demo dataset (3 vaults, 4 friends, 13 spendings).
 */
export const reloadDemoDataset = async (
  targetDb: KanawitaDB = db
): Promise<void> => {
  const now = Date.now();
  const demoVaults = DEFAULT_VAULTS.map((v) => ({ ...v, updatedAt: now }));
  const demoFriends = DEFAULT_FRIENDS.map((f) => ({ ...f, updatedAt: now }));
  const demoTxs = buildInitialSeedTransactions(now);

  const demoFriendIds = new Set(demoFriends.map((f) => f.id));
  const demoTxIds = new Set(demoTxs.map((t) => t.id));

  await targetDb.transaction(
    'rw',
    [
      targetDb.vaults,
      targetDb.categories,
      targetDb.friends,
      targetDb.transactions,
      targetDb.settings,
      targetDb.syncOutbox,
    ],
    async () => {
      const [
        existingFriends,
        existingTxs,
        currentSettings,
        existingIpOutbox,
      ] = await Promise.all([
        targetDb.friends.toArray(),
        targetDb.transactions.toArray(),
        targetDb.settings.get('app_settings'),
        targetDb.syncOutbox
          .where('collection')
          .equals('authorizedIps')
          .toArray(),
      ]);

      await targetDb.syncOutbox.clear();
      if (existingIpOutbox.length > 0) {
        await targetDb.syncOutbox.bulkPut(existingIpOutbox);
      }

      for (const oldFriend of existingFriends) {
        if (!demoFriendIds.has(oldFriend.id)) {
          await enqueueOutboxItem(
            targetDb,
            'friends',
            oldFriend.id,
            'delete',
            { id: oldFriend.id, deletedAt: now },
            now
          );
        }
      }

      for (const oldTx of existingTxs) {
        if (!demoTxIds.has(oldTx.id)) {
          await enqueueOutboxItem(
            targetDb,
            'transactions',
            oldTx.id,
            'delete',
            { id: oldTx.id, deletedAt: now },
            now
          );
        }
      }

      await targetDb.vaults.clear();
      await targetDb.vaults.bulkPut(demoVaults);
      for (const v of demoVaults) {
        await enqueueOutboxItem(targetDb, 'vaults', v.id, 'upsert', v, now);
      }

      await targetDb.categories.clear();
      await targetDb.categories.bulkPut(DEFAULT_CATEGORIES);

      await targetDb.friends.clear();
      await targetDb.friends.bulkPut(demoFriends);
      for (const f of demoFriends) {
        await enqueueOutboxItem(targetDb, 'friends', f.id, 'upsert', f, now);
      }

      await targetDb.transactions.clear();
      await targetDb.transactions.bulkPut(demoTxs);
      for (const tx of demoTxs) {
        await enqueueOutboxItem(
          targetDb,
          'transactions',
          tx.id,
          'upsert',
          tx,
          now
        );
      }

      const nextSettings: AppSettings = {
        ...(currentSettings ?? DEFAULT_SETTINGS),
        lastVaultResetAt: null,
        updatedAt: now,
      };
      await targetDb.settings.put(nextSettings);
      await enqueueOutboxItem(
        targetDb,
        'settings',
        nextSettings.id,
        'upsert',
        nextSettings,
        now
      );
    }
  );

  notifySyncTrigger();
};
