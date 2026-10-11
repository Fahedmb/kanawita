import Dexie, { type Table } from 'dexie';
import {
  AppSettings,
  AuthorizedIpDevice,
  DEFAULT_AUTHORIZED_IPS,
  DEFAULT_CATEGORIES,
  DEFAULT_FRIENDS,
  DEFAULT_SETTINGS,
  DEFAULT_VAULTS,
  Friend,
  SpendingCategory,
  SyncOutboxItem,
  Transaction,
  VaultAccount,
  VaultId,
} from '@/domain/models';

export class KanawitaDB extends Dexie {
  vaults!: Table<VaultAccount, VaultId>;
  categories!: Table<SpendingCategory, string>;
  friends!: Table<Friend, string>;
  transactions!: Table<Transaction, string>;
  syncOutbox!: Table<SyncOutboxItem, string>;
  settings!: Table<AppSettings, string>;
  authorizedIps!: Table<AuthorizedIpDevice, string>;

  constructor(dbName = 'KanawitaLocalDB') {
    super(dbName);
    this.version(1).stores({
      vaults: 'id, updatedAt',
      categories: 'id, kind, sortOrder',
      friends: 'id, name, updatedAt',
      transactions:
        'id, type, categoryId, vaultId, timestamp, updatedAt, countInBalanceOffset',
      syncOutbox: 'id, collection, documentId, timestamp',
      settings: 'id, updatedAt',
      authorizedIps: 'id, ip, recognized, lastSeenAt, updatedAt',
    });
    this.version(2).stores({
      vaults: 'id, updatedAt',
      categories: 'id, kind, sortOrder',
      friends: 'id, name, updatedAt',
      transactions:
        'id, type, categoryId, vaultId, timestamp, updatedAt, countInBalanceOffset',
      syncOutbox: 'id, collection, documentId, timestamp',
      settings: 'id, updatedAt',
      authorizedIps: 'id, ip, recognized, lastSeenAt, updatedAt',
    });
  }
}

export const db = new KanawitaDB();

/**
 * Generates realistic initial Tunisian Dinar (TND / DT) demo transactions
 * so the unified balance offset, friend influence CPH engine, and metrics
 * dashboard are immediately meaningful on first launch.
 */
export const buildInitialSeedTransactions = (now = Date.now()): Transaction[] => {
  const hour = 3_600_000;
  const day = 24 * hour;

  return [
    {
      id: 'seed_tx_1',
      type: 'spending',
      amount: 4.5,
      categoryId: 'coffee',
      friendIds: ['friend_amine'],
      vibe: 'worth_it',
      note: 'Express + Croissant',
      countInBalanceOffset: true,
      timestamp: now - 3 * hour,
      updatedAt: now - 3 * hour,
      deletedAt: null,
    },
    {
      id: 'seed_tx_2',
      type: 'spending',
      amount: 3.2,
      categoryId: 'transport',
      friendIds: [],
      vibe: 'worth_it',
      note: 'Taxi Bolt',
      countInBalanceOffset: true,
      timestamp: now - 7 * hour,
      updatedAt: now - 7 * hour,
      deletedAt: null,
    },
    {
      id: 'seed_tx_3',
      type: 'spending',
      amount: 28.5,
      categoryId: 'food',
      friendIds: ['friend_yassine'],
      vibe: 'regret',
      note: 'Late night burger & dessert',
      countInBalanceOffset: true,
      timestamp: now - 1 * day - 2 * hour,
      updatedAt: now - 1 * day - 2 * hour,
      deletedAt: null,
    },
    {
      id: 'seed_tx_4',
      type: 'spending',
      amount: 5.5,
      categoryId: 'coffee',
      friendIds: ['friend_amine'],
      vibe: 'worth_it',
      note: 'Capucin Lac 1',
      countInBalanceOffset: true,
      timestamp: now - 2 * day - 4 * hour,
      updatedAt: now - 2 * day - 4 * hour,
      deletedAt: null,
    },
    {
      id: 'seed_tx_5',
      type: 'spending',
      amount: 14,
      categoryId: 'self_care',
      friendIds: [],
      vibe: 'worth_it',
      note: 'Barber fade + shampoo',
      countInBalanceOffset: true,
      timestamp: now - 3 * day - 5 * hour,
      updatedAt: now - 3 * day - 5 * hour,
      deletedAt: null,
    },
    {
      id: 'seed_tx_6',
      type: 'spending',
      amount: 34,
      categoryId: 'entertainment',
      friendIds: ['friend_yassine', 'friend_sarra'],
      vibe: 'regret',
      note: 'Lounge & games duo night',
      countInBalanceOffset: true,
      timestamp: now - 4 * day - 3 * hour,
      updatedAt: now - 4 * day - 3 * hour,
      deletedAt: null,
    },
    {
      id: 'seed_tx_7',
      type: 'spending',
      amount: 12.5,
      categoryId: 'food',
      friendIds: ['friend_mehdi'],
      vibe: 'worth_it',
      note: 'Makloub & Boga',
      countInBalanceOffset: true,
      timestamp: now - 5 * day - 6 * hour,
      updatedAt: now - 5 * day - 6 * hour,
      deletedAt: null,
    },
    {
      id: 'seed_tx_8',
      type: 'spending',
      amount: 11.5,
      categoryId: 'food',
      friendIds: ['friend_mehdi'],
      vibe: 'worth_it',
      note: 'Kafteji lunch',
      countInBalanceOffset: true,
      timestamp: now - 7 * day - 5 * hour,
      updatedAt: now - 7 * day - 5 * hour,
      deletedAt: null,
    },
    {
      id: 'seed_tx_9',
      type: 'spending',
      amount: 22,
      categoryId: 'food',
      friendIds: ['friend_sarra'],
      vibe: 'worth_it',
      note: 'Brunch Marsa',
      countInBalanceOffset: true,
      timestamp: now - 8 * day - 4 * hour,
      updatedAt: now - 8 * day - 4 * hour,
      deletedAt: null,
    },
    {
      id: 'seed_tx_10',
      type: 'spending',
      amount: 38,
      categoryId: 'entertainment',
      friendIds: ['friend_yassine', 'friend_sarra'],
      vibe: 'regret',
      note: 'Karting & dinner duo spike',
      countInBalanceOffset: true,
      timestamp: now - 10 * day - 2 * hour,
      updatedAt: now - 10 * day - 2 * hour,
      deletedAt: null,
    },
    // Monthly Fixed Spendings (excluded from daily burn when toggle is OFF)
    {
      id: 'seed_tx_rent',
      type: 'spending',
      amount: 650,
      categoryId: 'rent',
      friendIds: [],
      vibe: 'worth_it',
      note: 'Monthly Apartment Rent',
      countInBalanceOffset: false, // Already reflected in initial bank balance
      timestamp: now - 12 * day,
      updatedAt: now - 12 * day,
      deletedAt: null,
    },
    {
      id: 'seed_tx_bills',
      type: 'spending',
      amount: 78.5,
      categoryId: 'bills_internet',
      friendIds: [],
      vibe: 'worth_it',
      note: 'Topnet Fiber + STEG',
      countInBalanceOffset: false,
      timestamp: now - 11 * day,
      updatedAt: now - 11 * day,
      deletedAt: null,
    },
    {
      id: 'seed_tx_gym',
      type: 'spending',
      amount: 90,
      categoryId: 'gym',
      friendIds: [],
      vibe: 'worth_it',
      note: 'California Gym Membership',
      countInBalanceOffset: false,
      timestamp: now - 9 * day,
      updatedAt: now - 9 * day,
      deletedAt: null,
    },
  ];
};

let seedPromise: Promise<void> | null = null;

/**
 * Ensures the local IndexedDB has the 3 reference vaults, 10 categories,
 * default settings, and initial starter data on first open.
 */
export const ensureDatabaseSeeded = async (
  targetDb: KanawitaDB = db
): Promise<void> => {
  if (typeof window === 'undefined' && targetDb === db) return;

  if (targetDb === db && seedPromise) {
    return seedPromise;
  }

  const runSeed = async () => {
    await targetDb.transaction(
      'rw',
      [
        targetDb.vaults,
        targetDb.categories,
        targetDb.friends,
        targetDb.transactions,
        targetDb.settings,
        targetDb.authorizedIps,
      ],
      async () => {
        const vaultCount = await targetDb.vaults.count();
        const categoryCount = await targetDb.categories.count();
        const settingsDoc = await targetDb.settings.get('app_settings');

        if (vaultCount === 0) {
          await targetDb.vaults.bulkPut(DEFAULT_VAULTS);
        }

        if (categoryCount === 0) {
          await targetDb.categories.bulkPut(DEFAULT_CATEGORIES);
        } else {
          // Ensure all 10 required categories exist
          for (const cat of DEFAULT_CATEGORIES) {
            const existing = await targetDb.categories.get(cat.id);
            if (!existing) {
              await targetDb.categories.put(cat);
            }
          }
        }

        if (!settingsDoc) {
          await targetDb.settings.put({
            ...DEFAULT_SETTINGS,
            securitySeeded: true,
            updatedAt: Date.now(),
          });
          // First-time initialization: seed friends, realistic starter spendings, and historical signup IPs
          const friendCount = await targetDb.friends.count();
          if (friendCount === 0) {
            await targetDb.friends.bulkPut(DEFAULT_FRIENDS);
          }
          const txCount = await targetDb.transactions.count();
          if (txCount === 0) {
            await targetDb.transactions.bulkPut(buildInitialSeedTransactions());
          }
          const ipCount = await targetDb.authorizedIps.count();
          if (ipCount === 0) {
            await targetDb.authorizedIps.bulkPut(DEFAULT_AUTHORIZED_IPS);
          }
        } else if (!settingsDoc.securitySeeded) {
          const ipCount = await targetDb.authorizedIps.count();
          if (ipCount === 0) {
            await targetDb.authorizedIps.bulkPut(DEFAULT_AUTHORIZED_IPS);
          }
          await targetDb.settings.put({
            ...settingsDoc,
            securitySeeded: true,
          });
        }
      }
    );
  };

  if (targetDb === db) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
    return seedPromise;
  }

  await runSeed();
};
