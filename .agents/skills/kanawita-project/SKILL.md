---
name: kanawita-project
description: "Living workspace skill and architectural reference for Kanawita (كنويطة) — TND Personal Finance, Unified Vault Tracker, 1-Tap Speed-Pad Logger, Hybrid Friend Influence Engine, and Offline Dexie.js + Background MongoDB Sync."
---

# Kanawita (كنويطة) — Living Project Skill

Use this skill whenever inspecting, extending, debugging, or verifying the **Kanawita** codebase. This skill is synchronized with `ARCHITECTURE.md`.

## 1. Domain & Product Summary
- **Currency:** Tunisian Dinar (`TND` / `DT`) with smart decimal formatting (`src/domain/formatTND.ts` — never forces trailing zeros; `4.5` -> `4.5 DT`, `0.2` -> `0.2 DT`, `1.255` -> `1.255 DT`).
- **Unified Balance Formula (`src/domain/balanceEngine.ts`):**
  $$\text{Gross Vaults Total} = \text{Bank (UIB)} + \text{Savings} + \text{Post Office (D17)}$$
  $$\text{Remaining Total Money} = \text{Gross Vaults Total} - \sum_{t \in \text{ActiveSpendings}} t.\text{amount}$$
  where `ActiveSpendings` are transactions with `type === 'spending'`, `!t.deletedAt`, and `t.countInBalanceOffset === true`.
- **2-Second Instant-Save Speed-Pad (`src/components/logger/SpeedPadLogger.tsx`):**
  - Custom mobile keypad (`0-9`, `.`, `⌫`, `+1`, `+5`, `+10 DT`) that never triggers the native phone text keyboard.
  - Horizontal Friend Chips bar (`Solo`, multi-select friends with live `🟢`/`🟡`/`🔴` influence dots, inline `+ Friend`) + optional `👍 Worth it` / `💀 Regret` vibe pill.
  - Single 1-tap category grid with 7 Daily categories (`coffee`, `food`, `transport`, `entertainment`, `clothes`, `self_care`, `other`) and 3 Monthly Fixed categories (`rent`, `bills_internet`, `gym`).
  - Tapping any category icon when amount > 0 saves immediately in `< 2ms` and shows a 5-second **Undo** toast.

## 2. Exact File Map & Responsibilities
- **Domain Layer (`src/domain/`):**
  - `src/domain/models.ts`: Canonical interfaces (`VaultAccount`, `SpendingCategory`, `Friend`, `Transaction`, `AuthorizedIpDevice`, `SyncOutboxItem`, `AppSettings`, `SyncRuntimeStatus`), `KANAWITA_SECURITY_PASSWORD` (`'61854'`), and default Tunisian seed constants.
  - `src/domain/formatTND.ts`: `roundTND`, `formatTND`, `appendKeypadKey`, `backspaceKeypad`, `addQuickAmount`, `parseKeypadAmount`.
  - `src/domain/balanceEngine.ts`: `computeUnifiedBalance(vaults, transactions)`.
  - `src/domain/influenceEngine.ts`: `computeFriendInfluence(friends, transactions, categories)`, `classifyInfluenceRatio`, `cycleManualOverride`. Computes per-friend CPH, Top Category, Worth-it/Regret counts, and Combo Duos.
  - `src/domain/metricsEngine.ts`: `computeDashboardMetrics(transactions, categories, { includeMonthlyBills })`. Computes Daily Burn Rate, Monthly Fixed Bills filter impact, Solo vs. Social ("Friend Tax") multiplier, Category Breakdown, Day-of-Week rhythm, Zero-Spend Streak, and 28-Day Heatmap.
  - `src/domain/securityEngine.ts`: `verifySecurityPassword` (`61854`), `normalizeIpAddress`, `ipToDocumentId`, `parseDeviceFromUserAgent`, `isIpAuthorized`, `appendSecurityPinKey`, `backspaceSecurityPin`.
  - `src/domain/domain.test.ts`: Vitest unit tests covering all domain math, security rules, and edge cases.
- **Data & Sync Layer (`src/data/`, `src/app/api/sync/route.ts`, `src/app/api/security/route.ts`):**
  - `src/data/db.ts`: `KanawitaDB` (`Dexie`) with tables `vaults`, `categories`, `friends`, `transactions`, `syncOutbox`, `settings`, `authorizedIps` and idempotent `ensureDatabaseSeeded()`.
  - `src/data/mongoServer.ts`: Shared `getMongoDatabase` & `isValidMongoUri` helper for Next.js API routes.
  - `src/data/repository.ts`: Atomic mutations (`logSpendingInstant`, `softDeleteTransaction`, `restoreTransaction`, `updateVaultBalance`, `clearAllSpendingOffsets`, `addFriend`, `removeFriend`, `cycleFriendInfluenceOverride`, `updateAppSettings`, `authorizeIpWithPassword`, `touchAuthorizedIpSession`, `revokeAuthorizedIp`, `queueAllAuthorizedIpsForSync`, `exportFullBackupJson`, `importFullBackupJson`).
  - `src/data/syncEngine.ts`: Background sync orchestrator (`initBackgroundSyncEngine`, `syncNow`, `mergeRemoteDataIntoLocal`, `subscribeSyncStatus`) with Last-Write-Wins (`updatedAt`) reconciliation and in-flight outbox timestamp protection.
  - `src/data/repository.test.ts`: Integration tests using `fake-indexeddb`.
  - `src/app/api/sync/route.ts` & `src/app/api/sync/route.test.ts`: Next.js App Router endpoint using native `mongodb` driver (`GET` status check, `POST` batch `bulkWrite` + collection pull including `authorizedIps`).
  - `src/app/api/security/route.ts` & `src/app/api/security/route.test.ts`: Next.js App Router endpoint detecting client IP & device User-Agent, verifying password `61854` for new IPs, registering old & new IPs in MongoDB `authorizedIps`, and revoking deleted IPs.
- **UI Layer (`src/components/` & `src/app/`):**
  - `src/components/vault/UnifiedVaultHeader.tsx`: Giant `Remaining Total Money` hero + 3 editable reference vault cards (`Bank (UIB)`, `Savings`, `Post Office (D17)`) + `Sync & Clear Spending Offset` modal.
  - `src/components/logger/SpeedPadLogger.tsx`: Custom TND keypad, Friend Chips bar, 1-Tap Category grid, and 5-second Undo toast.
  - `src/components/feed/RecentActivitySheet.tsx`: Filterable activity log with 1-tap delete/restore.
  - `src/components/friends/FriendsInfluenceView.tsx`: Friend management, CPH cards, 1-tap manual override badge cycler, and Combo Duos spotlight.
  - `src/components/metrics/MetricsDashboardView.tsx`: 1-tap "Exclude Monthly Fixed Bills" toggle, KPI strip, Friend Tax split bar, Category breakdown, Day-of-Week chart, and 28-day heatmap.
  - `src/components/security/SecurityPasswordGate.tsx`: Full-screen password gate (`61854`) displayed only when signing in from an unrecognized/new IP address.
  - `src/components/security/SecurityDevicesView.tsx`: Dedicated Security tab displaying signup devices, recognized IPs, MongoDB sync, IP simulator, and 1-tap IP deletion/revocation.
  - `src/components/settings/SettingsSyncView.tsx`: Live Sync Status, MongoDB URI config, Evening Reminder notification, and 1-tap JSON Export/Import.

## 3. Verification Commands
- Run unit & integration tests: `npm test`
- Run strict TypeScript check: `npm run typecheck`
- Run ESLint check: `npm run lint`
- Run Next.js production build: `npm run build`

