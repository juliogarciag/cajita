---
title: "feat: Improve movement table row actions with dropdown menu"
type: feat
status: completed
date: 2026-03-13
---

# feat: Improve movement table row actions with dropdown menu

## Overview

Replace the cryptic icon buttons in the movements table actions column with a cleaner pattern: a visible budget link for budget-managed rows, and an ellipsis (`⋯`) dropdown menu for secondary actions (reconcile, delete). Remove the redundant wallet icon.

## Problem Statement / Motivation

The current row actions have usability issues:

1. **Icons are cryptic** — Lock (reconcile), Wallet (budget-managed), Trash (delete) require guessing or hovering for tooltips
2. **Too many icons visible at once** — Budget-managed rows show 3 icons (wallet + external link + lock), cluttering the row
3. **Redundant information** — The wallet icon just says "managed by budget" but the budget link already implies that
4. **Not all actions are equally important** — The budget link is used often; reconcile and delete are occasional

## Proposed Solution

Restructure the actions column into two zones:

| Row state | Always visible | Behind `⋯` dropdown |
|-----------|---------------|---------------------|
| **Frozen** | Lock icon (no change) | — (no dropdown) |
| **Budget-managed** | Budget link (`View budget →`) | Reconcile |
| **Normal** | — | Reconcile, Delete |

**Key changes:**

1. **Remove wallet icon** — Redundant with the budget link
2. **Budget link stays visible** — Small text link, always accessible
3. **Ellipsis dropdown** for secondary actions — Text labels ("Reconcile", "Delete") instead of icons
4. **Delete confirmation stays inline** — The "Yes" confirm button replaces the dropdown trigger temporarily (same pattern as today)

## Technical Approach

### Install `@radix-ui/react-dropdown-menu`

```bash
pnpm add @radix-ui/react-dropdown-menu
```

Radix is the right choice here: accessible, unstyled (works with Tailwind), handles positioning/portals/keyboard navigation, and is the de facto standard for React dropdown menus. The project already uses `react-day-picker` as a third-party UI primitive, so this isn't the first.

### New component: `RowActionsMenu`

A small component in `src/components/RowActionsMenu.tsx` that wraps Radix's DropdownMenu:

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'

interface RowActionsMenuProps {
  onReconcile: () => void
  onDelete?: () => void  // undefined for budget-managed rows
}

export function RowActionsMenu({ onReconcile, onDelete }: RowActionsMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 shadow-md"
        >
          <DropdownMenu.Item
            onSelect={onReconcile}
            className="cursor-pointer px-3 py-1.5 text-sm text-gray-700 outline-none hover:bg-gray-50"
          >
            Reconcile
          </DropdownMenu.Item>

          {onDelete && (
            <DropdownMenu.Item
              onSelect={onDelete}
              className="cursor-pointer px-3 py-1.5 text-sm text-red-600 outline-none hover:bg-red-50"
            >
              Delete
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

### Update `MovementsTable.tsx` actions column

Replace the current actions block (lines 260–312) with:

```tsx
<div className={`${COL.actions} shrink-0 flex items-center justify-end gap-1 pr-2`}>
  {frozen ? (
    <Lock size={14} className="text-gray-300" />
  ) : budgetManaged ? (
    <>
      <Link
        to="/finances/budgets/$budgetId"
        params={{ budgetId: movementToBudgetId.get(row.id)! }}
        className="text-xs text-blue-600 hover:underline"
      >
        Budget →
      </Link>
      <RowActionsMenu
        onReconcile={() => setCheckpointRowId(row.id)}
      />
    </>
  ) : deletingId === row.id ? (
    <button
      data-confirm-delete
      onClick={() => handleDelete(row.id)}
      className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
    >
      Confirm?
    </button>
  ) : (
    <RowActionsMenu
      onReconcile={() => setCheckpointRowId(row.id)}
      onDelete={() => setDeletingId(row.id)}
    />
  )}
</div>
```

### Adjust column width

`COL.actions` can go back to a smaller width since we're no longer cramming 3 icons. `w-[100px]` gives room for the "Budget →" text link + ellipsis button side by side, while being narrower than the current 80px with 3 icons.

### Remove unused imports

Remove `Wallet` and `ExternalLink` from the lucide-react import in `MovementsTable.tsx` (they're no longer used). Add `MoreHorizontal` if the trigger icon is rendered inline instead of inside the component.

## Acceptance Criteria

- [x] `pnpm add @radix-ui/react-dropdown-menu` installed
- [x] `RowActionsMenu` component created at `src/components/RowActionsMenu.tsx`
- [x] Frozen rows: unchanged (lock icon)
- [x] Budget-managed rows: "Budget →" link always visible + ellipsis dropdown with "Reconcile"
- [x] Normal rows: ellipsis dropdown with "Reconcile" and "Delete"
- [x] Delete triggers existing confirmation flow (shows "Confirm?" button, click-away dismisses)
- [x] Wallet icon removed entirely
- [x] Dropdown menu items use text labels, not icons
- [x] Dropdown uses Radix portal (renders outside the `overflow-x-hidden` scroll container)
- [x] Keyboard accessible: Enter/Space opens menu, arrow keys navigate, Escape closes
- [x] TypeScript compiles cleanly (`npx tsc --noEmit`)

## Dependencies & Risks

- **New dependency**: `@radix-ui/react-dropdown-menu` (~8KB gzipped). First Radix package in the project. Radix packages are modular — this doesn't pull in a full UI library.
- **Overflow clipping**: The Radix dropdown uses a Portal by default, so it renders outside the `overflow-x-hidden` container — no clipping risk.
- **Virtual scroll compatibility**: The dropdown mounts on document body via portal, so virtualizer won't unmount it when scrolling.

## Sources & References

- Current actions implementation: `src/components/MovementsTable.tsx:260-312`
- Column width constants: `src/components/TableRow.tsx:26-32`
- Click-away dismiss hook: `src/lib/use-click-away-dismiss.ts`
- Existing popover pattern: `src/components/CheckpointPopover.tsx`
