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

export const KANAWITA_SECURITY_PASSWORD = '61854';

export type DeviceKind = 'mobile' | 'tablet' | 'desktop';

export interface AuthorizedIpDevice {
  id: string;                 // Deterministic ID, e.g. "ip_197_26_18_42"
  ip: string;                 // Normalized IP address, e.g. "197.26.18.42"
  deviceName: string;         // e.g. "iPhone 15 • Mobile Safari"
  os: string;                 // e.g. "iOS", "Windows", "Android", "macOS"
  browser: string;            // e.g. "Safari", "Chrome", "Firefox", "Edge"
  deviceType: DeviceKind;     // 'mobile' | 'tablet' | 'desktop'
  userAgent: string;          // Raw User-Agent string
  locationHint?: string;      // Optional network/location description
  isInitialSignup: boolean;   // True if this device was used for initial signup
  recognized: boolean;        // True when authorized/recognized
  createdAt: number;          // First authorized timestamp
  lastSeenAt: number;         // Most recent access timestamp
  signInCount: number;        // Number of verified sign-ins from this IP
  updatedAt: number;          // LWW sync timestamp
}

export type SyncCollectionName =
  | 'vaults'
  | 'categories'
  | 'friends'
  | 'transactions'
  | 'settings'
  | 'authorizedIps';

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
  securitySeeded?: boolean;
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
  securitySeeded: true,
  updatedAt: 1730000000000,
};

export const DEFAULT_AUTHORIZED_IPS: AuthorizedIpDevice[] = [
  {
    id: 'ip_197_26_18_42',
    ip: '197.26.18.42',
    deviceName: 'iPhone 15 • Mobile Safari',
    os: 'iOS',
    browser: 'Safari',
    deviceType: 'mobile',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    locationHint: 'Tunis • Tunisie Telecom 5G',
    isInitialSignup: true,
    recognized: true,
    createdAt: 1729500000000,
    lastSeenAt: 1730000000000,
    signInCount: 14,
    updatedAt: 1730000000000,
  },
  {
    id: 'ip_41_226_45_110',
    ip: '41.226.45.110',
    deviceName: 'MacBook Pro • Chrome',
    os: 'macOS',
    browser: 'Chrome',
    deviceType: 'desktop',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locationHint: 'La Marsa • Topnet Fiber',
    isInitialSignup: false,
    recognized: true,
    createdAt: 1729800000000,
    lastSeenAt: 1730050000000,
    signInCount: 6,
    updatedAt: 1730050000000,
  },
];

