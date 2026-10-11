---
trigger: always_on
alwaysApply: true
description: "Always-on UX, domain, and architectural guardrails for Kanawita (كنويطة) — TND Personal Finance & Friend Influence Tracker."
---

# Kanawita (كنويطة) — Vision & Architectural Guardrails

You are working on **Kanawita (كنويطة)**, a personal finance and social spending tracker engineered for **Tunisian Dinar (`TND` / `DT`)** with near-zero logging friction.

## 1. Non-Negotiable Core Rules

1. **Tunisian Dinar (`TND` / `DT`) Native Formatting:**
   - Never force trailing zeros (e.g., `4.5` displays as `4.5 DT`, `0.2` displays as `0.2 DT`, `12` displays as `12 DT`, `1.250` displays as `1.25 DT` or up to 3 decimals if millimes are entered like `1.255 DT`).
   - All numeric amounts must render with `font-variant-numeric: tabular-nums` (`tabular-nums`) so numbers never jitter during keypad entry or animations.

2. **Unified Total Money Pool + 3 Reference Vaults:**
   - The 3 reference sources are **`Bank (UIB)`** (`uib_bank`), **`Savings`** (`savings`), and **`Post Office (D17)`** (`post_office`).
   - They sum into **1 Unified Total Balance (`Total Money`)**.
   - Every logged spending (`type: 'spending'` with `countInBalanceOffset: true` and `!deletedAt`) automatically subtracts from that unified total:
     `Remaining Total Money = Sum(3 Vaults) - Sum(Active Offset Spendings)`.
   - **NEVER** force the user to choose which bank/vault account a daily spending came from when logging.
   - Tapping any of the 3 vault cards allows `+ Add`, `- Subtract`, or `= Set Balance`, plus a **"Sync & Clear Offset"** option to absorb/reset `countInBalanceOffset` on past transactions when syncing real-world balances from UIB/D17 apps.

3. **2-Second "Tap Category = Instant Save" Speed-Pad:**
   - Custom tactile mobile keypad (`0-9`, `.`, `⌫`, plus quick `+1`, `+5`, `+10 DT` chips). Never trigger the native mobile OS text keyboard for amount entry.
   - Horizontal scrollable **Friend Chips** bar (`Solo`, friend chips, inline `+ Add Friend`) + optional 1-tap `👍 Worth it` / `💀 Regret` vibe pill right above the categories.
   - **Single 1-Tap Category Grid** containing both:
     - **Daily (`kind: 'daily'`):** `Coffee` ☕, `Food` 🍔, `Transport` 🚕, `Entertainment` 🎮, `Clothes` 👕, `Self-Care` 💈, `Other` 📦.
     - **Monthly Fixed (`kind: 'monthly'`):** `Rent` 🏠, `Bills & Internet` ⚡, `Gym` 🏋️.
   - **Tap Category = Instant Save:** When amount > 0, tapping any category icon saves immediately (`< 2ms` via Dexie), triggers subtle haptic feedback (`navigator.vibrate`), resets the keypad, and displays a 5-second **Undo** toast. No separate "Submit" button.

4. **Hybrid Friend Influence Engine (`Good` 🟢 / `Neutral` 🟡 / `Bad` 🔴):**
   - Users can add and remove friends anytime.
   - Automatically compute each friend's **Total Spent (`DT`)**, **Hangout Count**, **Average Cost Per Hangout (`CPH`)**, **Top Category**, and **Combo Duos** (pairs of friends whose joint hangouts spike spending).
   - Auto-classify against median social CPH (excluding monthly fixed bills):
     - `Good Influence` (🟢): `ratio <= 0.90`
     - `Neutral` (🟡): `0.90 < ratio <= 1.20`
     - `Bad Influence` (🔴): `ratio > 1.20`
   - Support 1-tap manual override (`manualOverride: 'good' | 'neutral' | 'bad' | null`) that cycles `Auto -> Good -> Bad -> Neutral`.

5. **Metrics Dashboard & Monthly Fixed Bills Filter:**
   - Must include a 1-tap toggle: **"Include / Exclude Monthly Fixed Bills (`Rent`, `Bills & Internet`, `Gym`)"** (defaulting to excluding monthly fixed bills from daily burn rate so big bills never distort daily averages).
   - Display: Category Breakdown (`DT` & `%`), Daily Average Burn Rate, Solo vs. Social ("Friend Tax") ratio, Day-of-Week spending chart, Savings Streak indicator, and 28-Day Activity & Zero-Spend Heatmap.

6. **100% Phone Offline Storage (`Dexie.js`) + Background MongoDB Atlas Sync:**
   - All data lives in IndexedDB (`vaults`, `categories`, `friends`, `transactions`, `syncOutbox`, `settings`) for 0ms offline-first operation.
   - Every mutation writes atomically to its store and queues a `SyncOutboxItem`.
   - `syncEngine.ts` flushes the outbox to `/api/sync` (`mongodb` native driver) whenever online and a `MONGODB_URI` is configured (via `.env` or in-app Settings).

7. **Clean Architecture & Emil Kowalski Craft:**
   - Strict separation between `src/domain/` (pure TypeScript math & formatting, zero React/DB imports), `src/data/` (Dexie + repository + syncEngine), and `src/components/` (tactile UI).
   - Active press states (`active:scale-[0.97]`), custom ease-out curves, hardware-accelerated transforms, and `prefers-reduced-motion` support.
