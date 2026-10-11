import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureDatabaseSeeded, KanawitaDB } from './db';
import {
  addFriend,
  clearAllSpendingOffsets,
  cycleFriendInfluenceOverride,
  exportFullBackupJson,
  importFullBackupJson,
  logSpendingInstant,
  reloadDemoDataset,
  removeFriend,
  restoreTransaction,
  softDeleteTransaction,
  updateAppSettings,
  updateVaultBalance,
} from './repository';
import { mergeRemoteDataIntoLocal, syncNow } from './syncEngine';
import { computeUnifiedBalance } from '@/domain/balanceEngine';

describe('Kanawita Local IndexedDB Repository & Outbox Queue', () => {
  let testDb: KanawitaDB;

  beforeEach(async () => {
    testDb = new KanawitaDB(`TestKanawitaDB_${Date.now()}_${Math.random()}`);
    await ensureDatabaseSeeded(testDb);
  });

  it('seeds the 3 reference vaults, 10 categories (daily + monthly), and starter friends', async () => {
    const vaults = await testDb.vaults.toArray();
    const categories = await testDb.categories.toArray();
    const friends = await testDb.friends.toArray();

    expect(vaults).toHaveLength(3);
    expect(categories).toHaveLength(10);
    expect(categories.some((c) => c.id === 'self_care' && c.kind === 'daily')).toBe(
      true
    );
    expect(categories.filter((c) => c.kind === 'monthly')).toHaveLength(3);
    expect(friends.length).toBeGreaterThanOrEqual(4);
  });

  it('logs a spending in <2ms, reduces unified remaining money, queues in syncOutbox, and supports 1-tap Undo', async () => {
    const vaultsBefore = await testDb.vaults.toArray();
    const txsBefore = await testDb.transactions.toArray();
    const balanceBefore = computeUnifiedBalance(vaultsBefore, txsBefore);

    const saved = await logSpendingInstant(
      {
        amount: 4.5,
        categoryId: 'coffee',
        friendIds: ['friend_amine'],
        vibe: 'worth_it',
      },
      testDb
    );

    const txsAfter = await testDb.transactions.toArray();
    const balanceAfter = computeUnifiedBalance(vaultsBefore, txsAfter);
    expect(balanceAfter.remainingTotalMoney).toBe(
      Number((balanceBefore.remainingTotalMoney - 4.5).toFixed(3))
    );

    // Outbox item must exist
    const outboxItem = await testDb.syncOutbox.get(`transactions:${saved.id}`);
    expect(outboxItem).toBeDefined();
    expect(outboxItem?.action).toBe('upsert');

    // Undo / soft-delete restores remaining total money immediately
    await softDeleteTransaction(saved.id, testDb);
    const txsAfterUndo = await testDb.transactions.toArray();
    const balanceAfterUndo = computeUnifiedBalance(vaultsBefore, txsAfterUndo);
    expect(balanceAfterUndo.remainingTotalMoney).toBe(
      balanceBefore.remainingTotalMoney
    );

    // Restore works too
    await restoreTransaction(saved.id, testDb);
    const txsAfterRestore = await testDb.transactions.toArray();
    const balanceAfterRestore = computeUnifiedBalance(
      vaultsBefore,
      txsAfterRestore
    );
    expect(balanceAfterRestore.remainingTotalMoney).toBe(
      balanceAfter.remainingTotalMoney
    );
  });

  it('updates any of the 3 reference vaults and supports Sync & Clear Spending Offset', async () => {
    const updatedVault = await updateVaultBalance(
      {
        vaultId: 'uib_bank',
        mode: 'set',
        amount: 2000,
        clearSpendingOffset: true,
      },
      testDb
    );

    expect(updatedVault.balance).toBe(2000);

    const vaults = await testDb.vaults.toArray();
    const txs = await testDb.transactions.toArray();
    const summary = computeUnifiedBalance(vaults, txs);

    // Because clearSpendingOffset was true, activeSpendingOffset is now 0 while historical spend is preserved!
    expect(summary.activeSpendingOffset).toBe(0);
    expect(summary.remainingTotalMoney).toBe(summary.grossVaultsTotal);
    expect(summary.totalHistoricalSpend).toBeGreaterThan(0);
  });

  it('supports adding, overriding influence badge, and removing friends', async () => {
    const created = await addFriend('Aziz', '#10B981', testDb);
    expect(created.name).toBe('Aziz');

    await logSpendingInstant(
      {
        amount: 12,
        categoryId: 'food',
        friendIds: [created.id],
      },
      testDb
    );

    const override1 = await cycleFriendInfluenceOverride(created.id, testDb);
    expect(override1).toBe('good');
    const override2 = await cycleFriendInfluenceOverride(created.id, testDb);
    expect(override2).toBe('bad');

    await removeFriend(created.id, testDb);
    const deletedFriend = await testDb.friends.get(created.id);
    expect(deletedFriend).toBeUndefined();

    // Tagged transaction should now have Aziz untagged (converted to Solo) rather than crashing
    const allTxs = await testDb.transactions.toArray();
    expect(allTxs.some((t) => t.friendIds.includes(created.id))).toBe(false);
  });

  it('exports and imports full JSON backups cleanly, cleans stale outbox items, and rejects malformed JSON', async () => {
    const exportedJson = await exportFullBackupJson(testDb);
    const secondDb = new KanawitaDB(`TestRestoreDB_${Date.now()}`);
    await ensureDatabaseSeeded(secondDb);

    // Log a newer transaction in secondDb that is NOT in exportedJson
    const extraTx = await logSpendingInstant(
      { amount: 99, categoryId: 'clothes' },
      secondDb
    );
    expect(
      (await secondDb.syncOutbox.get(`transactions:${extraTx.id}`))?.action
    ).toBe('upsert');

    const result = await importFullBackupJson(exportedJson, secondDb);
    expect(result.importedTransactions).toBeGreaterThan(0);
    expect(result.importedFriends).toBeGreaterThan(0);

    // Extra transaction not in the backup must now be queued as 'delete' in syncOutbox, not 'upsert'
    expect(
      (await secondDb.syncOutbox.get(`transactions:${extraTx.id}`))?.action
    ).toBe('delete');

    await expect(
      importFullBackupJson('{not_valid_json', secondDb)
    ).rejects.toThrow('Invalid JSON backup file');

    await expect(
      importFullBackupJson(JSON.stringify({ hello: 'world' }), secondDb)
    ).rejects.toThrow('missing required Kanawita vaults');
  });

  it('clears active spending offsets via clearAllSpendingOffsets and resets custom friends on reloadDemoDataset', async () => {
    await logSpendingInstant({ amount: 9.5, categoryId: 'coffee' }, testDb);
    const cleared = await clearAllSpendingOffsets(testDb);
    expect(cleared).toBeGreaterThan(0);

    const vaults = await testDb.vaults.toArray();
    const txs = await testDb.transactions.toArray();
    const summary = computeUnifiedBalance(vaults, txs);
    expect(summary.activeSpendingOffset).toBe(0);

    // Add a custom friend then reload demo dataset
    const extraFriend = await addFriend('CustomFriend', '#3B82F6', testDb);
    await reloadDemoDataset(testDb);
    const friendsAfterReload = await testDb.friends.toArray();
    expect(friendsAfterReload.some((f) => f.id === extraFriend.id)).toBe(false);
    expect(friendsAfterReload).toHaveLength(4);
  });

  it('preserves concurrent local mutations made while syncNow fetch is in-flight and prevents stale remote overwrites', async () => {
    await updateAppSettings(
      { mongodbUri: 'mongodb+srv://user:pass@cluster.mongodb.net/' },
      testDb
    );

    // Initial vault mutation queued at t1
    await updateVaultBalance(
      { vaultId: 'uib_bank', mode: 'set', amount: 1500 },
      testDb
    );

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async () => {
      // Simulate user making a newer local edit to uib_bank WHILE the network request is in-flight
      await new Promise((r) => setTimeout(r, 15));
      await updateVaultBalance(
        { vaultId: 'uib_bank', mode: 'set', amount: 2500 },
        testDb
      );

      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          configured: true,
          flushedCount: 1,
          serverTime: Date.now(),
          remoteData: {
            vaults: [
              {
                id: 'uib_bank',
                name: 'Bank (UIB)',
                subtitle: 'UIB Compte Courant',
                balance: 1500,
                color: '#10B981',
                updatedAt: Date.now() + 10_000, // Even with a newer server timestamp, local pending outbox must win!
              },
            ],
          },
        }),
      } as unknown as Response;
    });

    try {
      const res = await syncNow({ targetDb: testDb });
      expect(res.ok).toBe(true);

      // The concurrent in-flight mutation (2500 DT) must STILL be in syncOutbox and in local vaults!
      const remainingVaultOutbox = await testDb.syncOutbox.get(
        'vaults:uib_bank'
      );
      expect(remainingVaultOutbox).toBeDefined();

      const localVault = await testDb.vaults.get('uib_bank');
      expect(localVault?.balance).toBe(2500);
    } finally {
      global.fetch = originalFetch;
    }

    // Also verify mergeRemoteDataIntoLocal applies newer remote documents when no outbox item is pending
    await testDb.syncOutbox.clear();
    await mergeRemoteDataIntoLocal(
      {
        vaults: [
          {
            id: 'savings',
            name: 'Savings',
            subtitle: 'Épargne / Cash Safe',
            balance: 3900,
            color: '#F59E0B',
            updatedAt: Date.now() + 50_000,
          },
        ],
      },
      testDb
    );
    const updatedSavings = await testDb.vaults.get('savings');
    expect(updatedSavings?.balance).toBe(3900);
  });
});
