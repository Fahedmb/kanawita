export type VaultId = 'uib_bank' | 'savings' | 'post_office';

export interface VaultAccount {
  id: VaultId;
  name: string;        // "Bank (UIB)" | "Savings" | "Post Office (D17)"
  subtitle: string;    // "UIB" | "Épargne" | "D17 / La Poste"
  balance: number;     // Reference amount in TND
  color: string;
  updatedAt: number;
}

export type CategoryKind = 'daily' | 'monthly';

export interface SpendingCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;  // 'daily' | 'monthly' (Rent, Bills & Internet, Gym)
  sortOrder: number;
}

export type InfluenceLevel = 'good' | 'neutral' | 'bad';

export interface Friend {
  id: string;
  name: string;
  avatarColor: string;
  manualOverride?: InfluenceLevel | null; // null = auto-calculated from Cost-Per-Hangout
  createdAt: number;
  updatedAt: number;
}

export type TransactionVibe = 'worth_it' | 'regret' | null;

export interface Transaction {
  id: string;
  type: 'spending' | 'vault_adjust';
  amount: number;                 // Positive number in TND (e.g., 4.5 = 4.5 DT)
  categoryId?: string;            // Category ID for spendings
  vaultId?: VaultId;              // Optional if adjusting a specific vault
  vaultAction?: 'add' | 'subtract' | 'set' | 'sync_reset';
  friendIds: string[];            // Tagged friend IDs (empty array = Solo spending)
  vibe?: TransactionVibe;
  note?: string;
  countInBalanceOffset: boolean;  // True for spendings created since last vault reset
  timestamp: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export type SyncCollectionName =
  | 'vaults'
  | 'categories'
  | 'friends'
  | 'transactions'
  | 'settings';

export interface SyncOutboxItem {
  id: string;
  collection: SyncCollectionName;
  documentId: string;
  action: 'upsert' | 'delete';
  payload: unknown;
  timestamp: number;
}

export interface AppSettings {
  id: 'app_settings';
  mongodbUri: string;
  mongodbDbName: string;
  includeMonthlyBillsInMetrics: boolean;
  eveningReminderEnabled: boolean;
  eveningReminderTime: string; // "21:00"
  lastSyncedAt: number | null;
  lastVaultResetAt: number | null;
  updatedAt: number;
}

export type SyncStateKind =
  | 'local_only'
  | 'queued_offline'
  | 'syncing'
  | 'synced'
  | 'sync_error';

export interface SyncRuntimeStatus {
  state: SyncStateKind;
  outboxCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  isConfigured: boolean;
}

export const DEFAULT_VAULTS: VaultAccount[] = [
  {
    id: 'uib_bank',
    name: 'Bank (UIB)',
    subtitle: 'UIB Compte Courant',
    balance: 1450,
    color: '#10B981', // Emerald
    updatedAt: 1730000000000,
  },
  {
    id: 'savings',
    name: 'Savings',
    subtitle: 'Épargne / Cash Safe',
    balance: 2800,
    color: '#F59E0B', // Amber Gold
    updatedAt: 1730000000000,
  },
  {
    id: 'post_office',
    name: 'Post Office (D17)',
    subtitle: 'D17 / La Poste',
    balance: 320.5,
    color: '#3B82F6', // Royal Blue
    updatedAt: 1730000000000,
  },
];

export const DEFAULT_CATEGORIES: SpendingCategory[] = [
  // Daily Micro-Spendings (kind: 'daily')
  {
    id: 'coffee',
    name: 'Coffee',
    icon: '☕',
    color: '#F59E0B',
    kind: 'daily',
    sortOrder: 1,
  },
  {
    id: 'food',
    name: 'Food',
    icon: '🍔',
    color: '#EF4444',
    kind: 'daily',
    sortOrder: 2,
  },
  {
    id: 'transport',
    name: 'Transport',
    icon: '🚕',
    color: '#3B82F6',
    kind: 'daily',
    sortOrder: 3,
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    icon: '🎮',
    color: '#8B5CF6',
    kind: 'daily',
    sortOrder: 4,
  },
  {
    id: 'clothes',
    name: 'Clothes',
    icon: '👕',
    color: '#EC4899',
    kind: 'daily',
    sortOrder: 5,
  },
  {
    id: 'self_care',
    name: 'Self-Care',
    icon: '💈',
    color: '#14B8A6',
    kind: 'daily',
    sortOrder: 6,
  },
  {
    id: 'other',
    name: 'Other',
    icon: '📦',
    color: '#64748B',
    kind: 'daily',
    sortOrder: 7,
  },
  // Monthly Fixed Spendings (kind: 'monthly')
  {
    id: 'rent',
    name: 'Rent',
    icon: '🏠',
    color: '#F97316',
    kind: 'monthly',
    sortOrder: 8,
  },
  {
    id: 'bills_internet',
    name: 'Bills & Internet',
    icon: '⚡',
    color: '#06B6D4',
    kind: 'monthly',
    sortOrder: 9,
  },
  {
    id: 'gym',
    name: 'Gym',
    icon: '🏋️',
    color: '#10B981',
    kind: 'monthly',
    sortOrder: 10,
  },
];

export const FRIEND_AVATAR_COLORS: string[] = [
  '#10B981',
  '#F59E0B',
  '#3B82F6',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
  '#F97316',
  '#06B6D4',
];

export const DEFAULT_FRIENDS: Friend[] = [
  {
    id: 'friend_amine',
    name: 'Amine',
    avatarColor: '#10B981',
    manualOverride: null,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
  {
    id: 'friend_yassine',
    name: 'Yassine',
    avatarColor: '#F59E0B',
    manualOverride: null,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
  {
    id: 'friend_sarra',
    name: 'Sarra',
    avatarColor: '#EC4899',
    manualOverride: null,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
  {
    id: 'friend_mehdi',
    name: 'Mehdi',
    avatarColor: '#3B82F6',
    manualOverride: null,
    createdAt: 1730000000000,
    updatedAt: 1730000000000,
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app_settings',
  mongodbUri: '',
  mongodbDbName: 'kanawita',
  includeMonthlyBillsInMetrics: false,
  eveningReminderEnabled: false,
  eveningReminderTime: '21:00',
  lastSyncedAt: null,
  lastVaultResetAt: null,
  updatedAt: 1730000000000,
};
