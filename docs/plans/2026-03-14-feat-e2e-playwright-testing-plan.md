---
title: "feat: End-to-End Playwright Testing with Snapshot-First Skill"
type: feat
status: completed
date: 2026-03-14
---

# End-to-End Playwright Testing with Snapshot-First Skill

## Overview

Set up Playwright e2e testing for Cajita with a Claude Code skill (`e2e-test`) that enforces a "snapshot first, then write test" workflow. The skill ensures that before writing any `.spec.ts` file, Claude uses `playwright-cli` to observe the real page DOM — eliminating guessed selectors and making tests resilient to UI changes.

## Problem Statement

Making changes to Cajita creates bugs that aren't caught until manual testing. The app has zero e2e tests despite having complex cross-feature interactions (movements ↔ budgets ↔ categories ↔ checkpoints). The existing `playwright-cli` skill provides browser automation, but there's no process that forces its use before test authoring — leading to tests written with guessed selectors that break immediately.

## Proposed Solution

Two deliverables:

1. **`e2e-test` Claude Code skill** — triggers when writing Playwright tests, enforces the snapshot-first workflow as a process guardrail
2. **Playwright test infrastructure** — config, global auth, test helpers, and test files for priority flows

### The Snapshot-First Workflow

```
Ask Claude to write a test
        ↓
   e2e-test skill triggers
        ↓
   playwright-cli open → dev-login → navigate to page
        ↓
   playwright-cli snapshot → read YAML → understand real DOM
        ↓
   playwright-cli interact (click, fill) → observe what happens
        ↓
   Each command emits real Playwright code (getByRole, getByText, etc.)
        ↓
   Write .spec.ts using ONLY observed selectors + add assertions
        ↓
   npx playwright test → verify
```

## Technical Approach

### Architecture

```
cajita/
├── playwright.config.ts              # Playwright config (baseURL, webServer, auth)
├── tests/
│   └── e2e/
│       ├── global-setup.ts           # Hits /api/auth/dev-login, saves storageState
│       ├── .auth/
│       │   └── session.json          # Persisted auth state (gitignored)
│       ├── helpers/
│       │   ├── seed.ts               # Test data creation via server functions
│       │   └── cleanup.ts            # Test data teardown
│       ├── movements.spec.ts         # Movements CRUD + running totals
│       ├── categories.spec.ts        # Categories CRUD + archiving
│       ├── budgets.spec.ts           # Budgets + budget items + sync
│       ├── checkpoints.spec.ts       # Freeze boundary + server enforcement
│       └── navigation.spec.ts        # Auth guards + nav + settings
└── .claude/
    └── skills/
        └── e2e-test/
            └── SKILL.md              # Snapshot-first workflow skill
```

### Key Architectural Decisions

#### Test Data Strategy: DOM-based waiting with unique names

- Tests create data with **uniquely-suffixed names** (e.g., `"Groceries-${Date.now()}"`) to avoid collision
- After mutations, wait for the **DOM element to appear** via Playwright's built-in auto-waiting (e.g., `await expect(page.getByText('Groceries-1710...')).toBeVisible()`)
- This naturally handles ElectricSQL sync delay — Playwright retries until timeout
- Cleanup: each test deletes what it created, or tests are idempotent by using unique names

#### ElectricSQL sync: No mocking, real stack

- Tests run against the real Postgres + ElectricSQL stack (requires Docker)
- This is the whole point of e2e tests — catching bugs in the real data flow
- `webServer` config starts the Vite dev server; Docker (Postgres + Electric) must be running separately

#### Auth: Global setup with storageState

- `global-setup.ts` navigates to `/api/auth/dev-login`, saves the session cookie via `storageState`
- All test projects depend on the setup project — tests reuse the authenticated state
- Session lasts 7 days, but global setup regenerates it each run

#### Virtual scroll: Use existing data attributes

- The movements table only renders ~40 DOM rows via `@tanstack/react-virtual`
- Use `data-row-id` attributes (already in the code) to locate specific rows
- For out-of-viewport rows, use `scrollIntoViewIfNeeded()` before interacting
- Never assert on rows that haven't been scrolled into view

#### Browser: Chromium only

- Single browser target for speed — cross-browser adds complexity without proportional value for this app

### Implementation Phases

#### Phase 1: Infrastructure + Skill

**Tasks:**

- [x] Install `@playwright/test` as dev dependency
- [x] Install Chromium browser via `npx playwright install chromium`
- [x] Create `playwright.config.ts`
  - `baseURL: "http://localhost:3000"`
  - `storageState` for auth reuse
  - `webServer` pointing to `npm run dev`
  - Setup project that runs `global-setup.ts` first
  - Single Chromium project depending on setup
- [x] Create `tests/e2e/global-setup.ts`
  - Navigate to `/api/auth/dev-login`
  - Wait for redirect to `/dashboard`
  - Save `storageState` to `tests/e2e/.auth/session.json`
- [x] Create `tests/e2e/.auth/` directory (gitignored)
- [x] Update `.gitignore` with Playwright artifacts (`playwright-report/`, `blob-report/`, `test-results/`, `tests/e2e/.auth/`)
- [x] Add `"test:e2e": "npx playwright test"` script to `package.json`
- [x] Create `.claude/skills/e2e-test/SKILL.md` — the snapshot-first skill

**Skill design (`e2e-test/SKILL.md`):**

The skill should:
- Trigger on: "write a test for", "test this flow", "add e2e tests", "create Playwright test"
- Have `allowed-tools: Bash(playwright-cli:*), Bash(npx playwright:*)`
- Enforce this sequence:
  1. Auth: `playwright-cli open http://localhost:3000/api/auth/dev-login`
  2. Navigate: `playwright-cli goto <target-page>`
  3. Snapshot: `playwright-cli snapshot` — read the YAML output
  4. Interact: walk through the flow, snapshot after each significant action
  5. Collect the Playwright code emitted by each command
  6. Write the `.spec.ts` file using ONLY the observed selectors
  7. Run: `npx playwright test <file>` to verify
- Document: app routes, auth flow, data attributes (`data-row-id`, `data-editable-cell`, etc.)
- Anti-patterns: no CSS selectors, no guessed button names, no `waitForTimeout()`

**Success criteria:**
- [x] `npx playwright test` runs the global setup and exits cleanly (no test files yet is OK)
- [x] Skill triggers when asked to write a test

**Estimated effort:** Small — mostly config files and the skill markdown

---

#### Phase 2: Movements CRUD Tests

The highest-value tests. Movements is the most-used feature with the most complexity (virtual scroll, editable cells, running totals, category selection).

**Tasks:**

- [x] Create `tests/e2e/movements.spec.ts`
- [x] Use playwright-cli to snapshot `/finances/movements` and understand the real DOM

**Test cases:**

```
movements.spec.ts
├── describe('Movements CRUD')
│   ├── test('can add a new movement')
│   │   → Click "Add Movement" button
│   │   → Verify new row appears at bottom
│   │   → Verify page scrolls to new row
│   │
│   ├── test('can edit movement description')
│   │   → Click description cell → type new text → press Enter/Tab
│   │   → Verify cell shows updated text
│   │
│   ├── test('can edit movement date')
│   │   → Click date cell → use date picker → select date
│   │   → Verify cell shows new date
│   │
│   ├── test('can edit movement amount')
│   │   → Click amount cell → type new amount → press Enter
│   │   → Verify cell shows formatted amount
│   │   → Verify running total updates
│   │
│   ├── test('can set movement category')
│   │   → Click category cell → select from dropdown
│   │   → Verify cell shows category name + color
│   │
│   ├── test('can delete a movement')
│   │   → Open row actions menu → click delete → confirm ("Sure?")
│   │   → Verify row disappears
│   │   → Verify running total updates
│   │
│   └── test('running total is computed correctly')
│       → Add 3 movements with known amounts
│       → Verify each row's running total is cumulative sum
│       → Delete middle movement
│       → Verify totals recalculate
```

**Key implementation details:**
- Wait for ElectricSQL sync by asserting on the new DOM element: `await expect(page.getByText('test-description')).toBeVisible()`
- For virtual scroll: new movements are added at the bottom and the table scrolls there automatically
- The `ConfirmButton` requires two clicks: first shows "Sure?", second confirms
- Running total column needs mathematical verification (add amounts, check cumulative sums)

**Success criteria:**
- [x] All movement CRUD tests pass
- [x] Running total verification is mathematically correct
- [x] Tests handle the ConfirmButton two-click pattern

**Estimated effort:** Medium — first real tests, will establish patterns

---

#### Phase 3: Categories CRUD Tests

Categories are a dependency for movements and budgets. Testing them ensures the foundation is solid.

**Tasks:**

- [x] Create `tests/e2e/categories.spec.ts`
- [x] Use playwright-cli to snapshot `/finances/categories`

**Test cases:**

```
categories.spec.ts
├── describe('Categories CRUD')
│   ├── test('can add a new category')
│   │   → Click "Add Category" → fill name → pick color → save
│   │   → Verify category appears in list with correct color
│   │
│   ├── test('can edit category name')
│   │   → Click to edit → change name → press Enter
│   │   → Verify updated name shows
│   │
│   ├── test('can archive a category')
│   │   → Click "Archive" on a category
│   │   → Verify it disappears from main list
│   │   → Check "Show archived" checkbox → verify it reappears at 50% opacity
│   │
│   ├── test('can unarchive a category')
│   │   → Show archived → click "Unarchive"
│   │   → Verify it returns to main list at full opacity
│   │
│   ├── test('can delete a category')
│   │   → Click delete → confirm
│   │   → Verify removed from list
│   │
│   └── test('budget-owned categories cannot be edited or deleted')
│       → Create a budget (which auto-creates a category)
│       → Verify the category shows "Budget" badge
│       → Verify edit/archive/delete controls are absent or disabled
```

**Success criteria:**
- [x] Full CRUD cycle works
- [x] Archive/unarchive toggle works
- [x] Budget-owned category protection verified

**Estimated effort:** Small — simpler UI than movements

---

#### Phase 4: Checkpoints + Freeze Boundary Tests

Tests the most complex state interaction: checkpoints freeze movements and block server mutations.

**Tasks:**

- [x] Create `tests/e2e/checkpoints.spec.ts`
- [x] Use playwright-cli to snapshot the checkpoint popover and divider UI

**Test cases:**

```
checkpoints.spec.ts
├── describe('Checkpoints')
│   ├── test('can create a checkpoint on a movement')
│   │   → Open row actions → click "Create Checkpoint"
│   │   → Fill actual balance in popover → confirm
│   │   → Verify checkpoint divider appears below the row
│   │   → Verify divider shows Expected / Actual / Diff
│   │
│   ├── test('frozen movements cannot be edited')
│   │   → Create checkpoint
│   │   → Attempt to click a cell above the checkpoint
│   │   → Verify cell does NOT enter edit mode (disabled state)
│   │   → Verify lock icon is visible on frozen rows
│   │
│   ├── test('frozen movements cannot be deleted')
│   │   → Verify delete option is absent or disabled in row actions
│   │
│   ├── test('can unfreeze by deleting checkpoint')
│   │   → Click "Unfreeze" on checkpoint divider → confirm
│   │   → Verify divider disappears
│   │   → Verify previously frozen rows are now editable again
│   │
│   └── test('new movements added after checkpoint are NOT frozen')
│       → Create checkpoint
│       → Add new movement
│       → Verify new movement is editable (not frozen)
```

**Success criteria:**
- [x] Freeze boundary correctly disables cells
- [x] Unfreeze restores editability
- [x] New movements after checkpoint remain unfrozen

**Estimated effort:** Medium — requires careful setup with multiple movements

---

#### Phase 5: Budgets + Budget Items Tests

**Tasks:**

- [x] Create `tests/e2e/budgets.spec.ts`
- [x] Snapshot both `/finances/budgets` and `/finances/budgets/$budgetId`

**Test cases:**

```
budgets.spec.ts
├── describe('Budgets')
│   ├── test('can create a new budget')
│   │   → Fill form (year, name, color, annual amount) → submit
│   │   → Verify budget card appears in list
│   │   → Navigate to categories page → verify auto-created category exists
│   │
│   ├── test('can navigate to budget detail')
│   │   → Click budget card
│   │   → Verify URL changes to /finances/budgets/$id
│   │   → Verify summary bar shows annual/spent/remaining
│   │
│   ├── test('can add a budget item')
│   │   → Fill item form (description, date, amount) → submit
│   │   → Verify item appears in table
│   │
│   ├── test('can sync a budget item to movements')
│   │   → Set accounting_date on a budget item
│   │   → Click sync button
│   │   → Navigate to movements page → verify linked movement exists
│   │
│   ├── test('can unsync a budget item')
│   │   → Click unsync on synced item
│   │   → Navigate to movements → verify linked movement is removed
│   │
│   └── test('can delete a budget')
│       → Navigate to budget list → delete budget → confirm
│       → Verify budget card removed
│       → Verify auto-created category is also removed
│       → Verify remaining movement is also removed
```

**Success criteria:**
- [x] Budget creation cascade verified (budget + category + remaining movement)
- [x] Budget deletion cascade verified (all three removed)
- [x] Sync/unsync creates and removes movements correctly

**Estimated effort:** Large — most cross-feature interactions, multiple pages

---

#### Phase 6: Navigation, Auth Guards, and Settings

**Tasks:**

- [x] Create `tests/e2e/navigation.spec.ts`
- [x] Snapshot the nav bar, login page, and settings

**Test cases:**

```
navigation.spec.ts
├── describe('Auth guards')
│   ├── test('unauthenticated user is redirected to login')
│   │   → Use a fresh context (no storageState)
│   │   → Navigate to /dashboard
│   │   → Verify redirect to /
│   │
│   └── test('authenticated user on / is redirected to /dashboard')
│       → Navigate to /
│       → Verify redirect to /dashboard
│
├── describe('Navigation')
│   ├── test('main nav links work')
│   │   → Click Dashboard → verify URL
│   │   → Click Finances → verify URL
│   │   → Click Tools → verify URL
│   │
│   └── test('finances sub-nav appears on finance pages')
│       → Navigate to /finances/movements
│       → Verify sub-nav shows: Movements, Budgets, Categories, Settings
│       → Click each → verify URL changes
│
└── describe('Settings')
    └── test('can change date format')
        → Navigate to /finances/settings
        → Change date format toggle
        → Navigate to /finances/movements
        → Verify dates display in new format
```

**Success criteria:**
- [x] Auth guard redirects work both directions
- [x] Nav links resolve correctly
- [x] Date format setting persists across pages

**Estimated effort:** Small

---

## Flows Intentionally Not Tested (and Why)

| Flow | Reason |
|------|--------|
| **Create Playlist** (`/tools/create-playlist`) | Depends on Apple Music OAuth + Claude API. Would need heavy mocking that defeats e2e purpose. Better tested via unit/integration tests. |
| **Snapshots panel** (create/pin/restore) | Lower priority — less user-facing than movements CRUD. Can add in a later phase. |
| **Google OAuth login** | Can't be tested in e2e without browser extension or mocking Google. Dev-login covers auth verification. |
| **Concurrent edits via ElectricSQL** | Would require two browser contexts editing simultaneously. Complex setup, better tested via integration tests against the sync layer. |

## System-Wide Impact

### Interaction Graph

Creating a movement test exercises: UI click → `movementsCollection.insert()` → TanStack DB optimistic update → server function `createMovement` → Kysely insert → Postgres → ElectricSQL sync → shape update → `useLiveQuery` re-render → DOM update. This is the full data roundtrip.

### Error Propagation

Server validation errors (Zod) return error responses → TanStack DB rolls back optimistic update → UI reverts. Freeze boundary violations throw `Error('Cannot edit/delete a frozen movement')` → server returns error → toast notification via sonner. Tests should verify toasts appear on critical error paths (frozen edit attempt).

### State Lifecycle Risks

- **ElectricSQL sync delay**: Between server mutation and client DOM update, the test could assert too early. Mitigated by Playwright's auto-retry on `expect()` assertions (default 5s timeout).
- **Budget deletion cascade**: Three entities deleted in sequence. If any step fails, orphaned data remains. Tests should verify all three are gone.
- **Checkpoint freeze boundary**: Computed client-side in `useMemo`. If the computation is wrong, the wrong rows freeze. Tests verify the visual result, not the computation.

### API Surface Parity

All server functions used by the UI are exercised by the e2e tests: `createMovement`, `updateMovement`, `deleteMovement`, `createCategory`, `updateCategory`, `deleteCategory`, `archiveCategory`, `createBudget`, `deleteBudget`, `createBudgetItem`, `syncBudgetItem`, `unsyncBudgetItem`, `createCheckpoint`, `deleteCheckpoint`.

## Acceptance Criteria

### Functional Requirements

- [x] `npx playwright test` runs all tests against localhost:3000 with Docker services running
- [x] Global setup authenticates via `/api/auth/dev-login` and shares session across tests
- [x] Movements CRUD tests cover add, edit (all cell types), delete, and running total verification
- [x] Categories tests cover add, edit, archive/unarchive, delete, and budget-owned protection
- [x] Checkpoint tests verify freeze boundary disables editing and unfreeze restores it
- [x] Budget tests verify creation cascade (budget + category + remaining movement) and deletion cascade
- [x] Navigation tests verify auth guards and route protection
- [x] The `e2e-test` skill triggers when asked to write tests and enforces playwright-cli snapshot before writing .spec.ts

### Non-Functional Requirements

- [x] Tests complete in under 2 minutes total (Chromium only)
- [x] No `waitForTimeout()` calls — use Playwright auto-waiting only
- [x] Tests are independent — no ordering dependencies between test files
- [x] All selectors come from playwright-cli observation, not guessed

### Quality Gates

- [x] All tests pass on a clean `docker compose up -d && npm run dev` environment
- [x] The e2e-test skill documentation is complete and accurate

## Dependencies & Prerequisites

- Docker running with Postgres + ElectricSQL (`docker compose up -d`)
- Dev server running (`npm run dev`) — or let Playwright's `webServer` config start it
- `NODE_ENV=development` for dev-login to work
- Chromium installed via `npx playwright install chromium`

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ElectricSQL sync makes tests flaky | Medium | High | Use Playwright auto-retry on assertions. Default 5s timeout handles sync delay. |
| Virtual scroll hides test target rows | Medium | Medium | Use `data-row-id` + `scrollIntoViewIfNeeded()`. New rows auto-scroll to bottom. |
| Test data collides between parallel runs | Low | Medium | Use unique suffixes (timestamp) in test entity names. |
| Dev-login endpoint changes or breaks | Low | High | Global setup fails fast with clear error. Single point of failure, easy to debug. |
| Skill enforcement is too rigid | Medium | Low | Start with soft enforcement (checklist in skill doc, not hard blocks). |

## Sources & References

### Internal References

- Dev-login endpoint: `src/routes/api/auth/dev-login.ts`
- Auth guard: `src/routes/_authenticated.tsx` (`beforeLoad`)
- Movements table: `src/components/MovementsTable.tsx` (virtual scroll, editable cells)
- Editable cell: `src/components/EditableCell.tsx` (Tab navigation, data attributes)
- ConfirmButton: `src/components/ConfirmButton.tsx` (two-click delete pattern)
- Checkpoint popover: `src/components/CheckpointPopover.tsx`
- Categories list: `src/components/CategoriesList.tsx`
- Budget detail: `src/components/BudgetDetail.tsx` (sync/unsync, frozen items)
- Server mutations: `src/server/movements.ts`, `src/server/categories.ts`, `src/server/budgets.ts`, `src/server/budget-items.ts`, `src/server/checkpoints.ts`
- Existing data attributes: `data-row-id`, `data-editable-cell`, `data-editable-table`, `data-cell`
- Existing playwright-cli skill: `.claude/skills/playwright-cli/SKILL.md`

### Existing Plans

- Dev-login endpoint plan: `docs/plans/2026-03-13-feat-dev-only-login-endpoint-plan.md`
- Movements tracker plan: `docs/plans/2026-03-08-feat-financial-movements-tracker-plan.md`
- Reconciliation checkpoints plan: `docs/plans/2026-03-09-feat-reconciliation-checkpoints-plan.md`
