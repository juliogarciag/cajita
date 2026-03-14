---
name: e2e-test
description: Creates end-to-end Playwright tests by first using playwright-cli to snapshot pages and understand DOM structure, then writing proper .spec.ts test files. Use when writing, creating, or updating e2e tests, Playwright tests, or when the user says "write a test for", "test this flow", or "add e2e tests".
allowed-tools: Bash(playwright-cli:*), Bash(npx playwright:*)
---

# E2E Test Writing with Snapshot-First Workflow

You write Playwright e2e tests for the Cajita app. You NEVER guess at selectors or page structure. You ALWAYS use playwright-cli to observe the real page before writing any test code.

## THE RULE

**Before writing ANY test, you MUST snapshot every page involved in the flow.** No exceptions. If you haven't seen the page through playwright-cli, you don't know what's on it.

## WORKFLOW

### Step 1: Authenticate

The app requires authentication. Use the dev-login endpoint to get a session:

```bash
playwright-cli open http://localhost:3000/api/auth/dev-login
```

This redirects to `/dashboard` with a valid session cookie. The session persists for the browser session.

### Step 2: Navigate and Snapshot

For each page involved in the test flow:

```bash
playwright-cli goto http://localhost:3000/finances/movements
playwright-cli snapshot
```

Read the snapshot YAML file. Study:
- What elements exist (buttons, inputs, tables, links)
- Their ref IDs (e1, e2, etc.)
- Their roles and accessible names
- The page structure and hierarchy

### Step 3: Interact and Observe

Walk through the flow manually using playwright-cli to understand what happens:

```bash
playwright-cli click e5          # click the "Add" button
playwright-cli snapshot          # what appeared? a modal? a form?
playwright-cli fill e12 "Test"   # fill a field
playwright-cli snapshot          # did anything change?
playwright-cli click e15         # submit
playwright-cli snapshot          # what's the result?
```

Each command outputs the Playwright code it ran (e.g., `await page.getByRole('button', { name: 'Add' }).click()`). **Collect these** — they become your test steps.

### Step 4: Write the Test File

Now — and ONLY now — write the `.spec.ts` file in `tests/e2e/`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Movements', () => {
  test('can add a new movement', async ({ page }) => {
    // Use the EXACT selectors you observed from playwright-cli
    await page.goto('/finances/movements');

    // Selectors from playwright-cli output, NOT guessed
    await page.getByRole('button', { name: 'Add movement' }).click();
    await page.getByRole('textbox', { name: 'Description' }).fill('Groceries');
    // ... etc
  });
});
```

### Step 5: Verify the Test Runs

```bash
npx playwright test tests/e2e/movements.spec.ts
```

If it fails, use playwright-cli to re-snapshot and fix selectors.

## APP STRUCTURE

The app runs at `http://localhost:3000` with these routes:

**Public:**
- `/` — Login page (Google OAuth)

**Authenticated (all require session):**
- `/dashboard` — Welcome/home page
- `/finances/movements` — Financial transactions table (virtualized, editable cells)
- `/finances/budgets` — Budget list
- `/finances/budgets/$budgetId` — Budget detail with items
- `/finances/categories` — Category management
- `/finances/settings` — Finance settings (date format)
- `/tools/` — Tools landing page
- `/tools/create-playlist` — AI playlist generator

**Auth shortcut (dev only):**
- `/api/auth/dev-login` — Instant dev login, redirects to `/dashboard`

## EXISTING DATA ATTRIBUTES

The codebase already uses these data attributes — prefer them for stable locators:

- `data-row-id={id}` — on table rows in MovementsTable (unique row identifier)
- `data-editable-cell` — on editable cells in tables
- `data-editable-table` — on table container divs
- `data-disabled` — on frozen/disabled editable cells
- `data-cell="description"` — on the description cell div
- `data-confirm-delete` — on ConfirmButton elements

## TEST FILE CONVENTIONS

- Test files go in `tests/e2e/` with `.spec.ts` extension
- One file per feature area (movements, categories, budgets, etc.)
- Use `test.describe()` to group related tests
- Auth is handled via global setup (`storageState`), not per-test login
- Use role-based locators from playwright-cli output as primary selectors
- Use `data-*` attributes as fallback when role-based locators are ambiguous
- Add `await expect(...)` assertions — playwright-cli shows actions, YOU add the verification

## HANDLING ELECTICSQL SYNC

After mutations, data syncs from server → Postgres → ElectricSQL → client. Don't use `waitForTimeout()`. Instead, use Playwright's auto-waiting:

```typescript
// After creating a movement, wait for it to appear in the DOM
await expect(page.getByText('my-unique-description')).toBeVisible();
```

Use unique names (e.g., `Test-${Date.now()}`) to avoid collisions with existing data.

## HANDLING VIRTUAL SCROLL

The movements table uses `@tanstack/react-virtual` — only ~40 rows exist in the DOM at a time.

- New movements are added at the bottom and the table auto-scrolls there
- To interact with a specific row, use `data-row-id` to find it
- Never assert on rows that haven't been scrolled into view

## HANDLING CONFIRMBUTTON

Delete actions use a two-click confirmation pattern:
1. First click → button text changes to "Sure?"
2. Second click → action executes

```typescript
// Delete with confirmation
const deleteButton = page.getByRole('button', { name: 'Delete' });
await deleteButton.click(); // Shows "Sure?"
await page.getByRole('button', { name: 'Sure?' }).click(); // Confirms
```

## GLOBAL SETUP

The project uses a global setup that authenticates once and saves the session:

- `tests/e2e/global-setup.ts` — hits `/api/auth/dev-login`, saves storageState
- `playwright.config.ts` — configures baseURL, storageState, webServer

## WHAT TO ASSERT

After each significant action, assert the outcome:

- **Created something?** → `await expect(page.getByText('Groceries')).toBeVisible()`
- **Deleted something?** → `await expect(page.getByText('Groceries')).not.toBeVisible()`
- **Navigated?** → `await expect(page).toHaveURL(/.*budgets/)`
- **Number changed?** → Snapshot the value before, act, then check the new value
- **Error state?** → `await expect(page.getByRole('alert')).toBeVisible()`
- **Cell disabled?** → Check for `data-disabled` attribute on the cell

## ANTI-PATTERNS

- NEVER write `page.locator('.some-class')` or `page.locator('#some-id')` — use role-based selectors from playwright-cli
- NEVER guess what a button is called — snapshot and read the actual name
- NEVER write a test for a page you haven't snapshot'd in this session
- NEVER skip the authentication step
- NEVER hardcode waits (`page.waitForTimeout()`) — use Playwright's auto-waiting with `expect`
- NEVER use CSS/ID selectors when a role-based or data-attribute selector exists
