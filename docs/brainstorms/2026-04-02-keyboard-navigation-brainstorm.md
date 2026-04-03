# Keyboard Navigation in Editable Tables

**Date:** 2026-04-02
**Status:** Ready for planning

---

## What We're Building

Fix Tab/Shift+Tab keyboard navigation in the two editable table UIs (MovementsTable and BudgetDetail/BudgetItemRow) so that pressing Tab moves cleanly through every editable cell in sequence — Description → Date → Amount(s) → Category — and pressing Enter on any cell also confirms and advances to the next cell. Non-editable elements (actions column / ellipsis menu) are excluded from keyboard navigation entirely.

---

## Why This Approach

**Chosen approach: A — Wire up missing `onTab` + `tabIndex=-1` on actions**

The current infrastructure (`focusAdjacentCell`, `data-editable-cell` attributes, Tab intercepting in `EditableCell`) is nearly correct. The bug is a broken callback chain:

1. `DatePickerCell` and `AmountInput` intercept Tab on their inner `<input>` and call `onTab?.(shiftKey)` — but that callback is never passed from `EditableCell` to its children.
2. Because `onTab` is `undefined`, `e.preventDefault()` is never called.
3. The browser's native Tab kicks in, focusing the next focusable DOM element — the ellipsis/actions button.
4. Once in the actions column, there's no path back to the description/date/amount inputs.

**Why not Approach B (row-level coordinator) or C (context)?** They would work but involve significant structural changes for a bug that is fundamentally a missing callback wire-up. Approach A achieves the goal with minimal, targeted changes.

---

## Key Decisions

### 1. Tab sequence per row
- **MovementsTable:** description → date → amount\_cents → category\_id
- **BudgetItemRow:** description → date → amount\_cents → amount\_usd → accounting\_date
- Category and both dates in BudgetItemRow are included (all editable cells)
- Actions column (ellipsis menu) is excluded

### 2. End-of-row wraps to next row's first cell
`focusAdjacentCell` uses a global `querySelectorAll('[data-editable-cell]:not([data-disabled])')` within `[data-editable-table]`. Tab past the last cell of a row naturally lands on the first editable cell of the next row, because DOM order matches logical order.

### 3. End-of-table exits naturally
When Tab is pressed on the last editable cell of the last row, `focusAdjacentCell` finds no next cell and returns without calling `e.preventDefault()`. The browser then moves focus to whatever comes after the table.

### 4. Enter behaves like Tab (confirmed by user)
Enter should confirm the current cell and advance to the next editable cell — same navigation as Tab. `onEnter` callbacks in `DatePickerCell` and `AmountInput` get wired up too.

### 5. Date picker: Tab closes the calendar and moves on
When the calendar dropdown is open, Tab presses the date text input's handler (which saves the typed date and calls `onTab`). The calendar popup closes on blur. No change needed to calendar internals.

### 6. Actions column: `tabIndex=-1`
The ellipsis menu button (and any other focusable elements in the actions cell) gets `tabIndex={-1}`. This removes them from the natural Tab sequence entirely. They remain focusable by mouse click.

### 7. Virtualization: `scrollToIndex` + `requestAnimationFrame`
`focusAdjacentCell` in `EditableCell` currently uses `querySelectorAll` (DOM query). For `MovementsTable` with TanStack Virtual, rows outside `overscan: 20` are unmounted. If Tab reaches a row near the edge, the target cell may not yet be in the DOM.

Fix: after finding the target cell via DOM query, if the cell is not found (target row unmounted), fall back to clicking the logical next cell by scrolling first. In practice, the `overscan: 20` means rows stay mounted for 20 rows beyond the viewport, so this edge case only matters for rapid keyboard navigation across many rows. A `requestAnimationFrame` wait after `scrollToIndex` handles it.

---

## Changes Needed (Implementation Scope)

1. **`EditableCell.tsx`** — Pass its own Tab/Enter handler (`focusAdjacentCell`) as `onTab` and `onEnter` to all child editor components (DatePickerCell, AmountInput, CategorySelect). Currently no `onTab`/`onEnter` is passed at all.

2. **`DatePickerCell.tsx`** — Ensure `e.preventDefault()` is always called on Tab/Enter when `onTab`/`onEnter` is set (confirm this already happens; if not, add it).

3. **`AmountInput.tsx`** — Same as above.

4. **`CategorySelect.tsx`** — Verify it has Tab/Enter handling; if not, add it following the same pattern.

5. **Actions column (MovementsTable + BudgetItemRow)** — Add `tabIndex={-1}` to the actions cell wrapper.

6. **`focusAdjacentCell` in `EditableCell.tsx`** — Confirm it queries category cells (they should have `data-editable-cell` attribute already). Verify DOM query ordering matches visual row-then-column order.

7. **Virtualization edge case** — Add `scrollToIndex` fallback in `focusAdjacentCell` if no next DOM element is found (MovementsTable only).

---

## Resolved Questions

- **Should category be in Tab sequence?** Yes (all editable cells).
- **What happens at the last row's last cell?** Exit the table naturally (no `preventDefault`).
- **Arrow key navigation?** Not in scope — Tab only.
- **Date picker Tab behavior?** Close calendar and move to next cell.
- **Enter key?** Same as Tab — confirm and advance.

---

## Out of Scope

- Arrow key (↑↓←→) grid navigation
- Creating new rows via Tab on the last row
- Keyboard navigation for header row or frozen rows
- Screen reader / ARIA grid role (`role="grid"`, `aria-rowindex`, etc.) — could be a follow-up
