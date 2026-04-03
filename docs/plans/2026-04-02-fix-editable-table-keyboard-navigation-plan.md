---
title: "fix: Keyboard Tab navigation in editable tables"
type: fix
status: completed
date: 2026-04-02
origin: docs/brainstorms/2026-04-02-keyboard-navigation-brainstorm.md
---

# fix: Keyboard Tab navigation in editable tables

## Overview

Tab/Shift+Tab navigation in the two editable table UIs (MovementsTable and BudgetDetail/BudgetItemRow) is broken in multiple ways. The infrastructure is nearly correct, but a chain of missing callback wire-ups causes navigation to spill into the actions column (ellipsis menu, buttons), from which there is no path back to the editable cells.

The fix targets five specific bugs in the existing system without restructuring it.

## Problem Statement

Current broken flows:

1. **Date cells are invisible to `focusAdjacentCell`** — For `type="date"`, `EditableCell` returns `DatePickerCell` directly with no wrapping `div` carrying `data-editable-cell`. Date cells are absent from the DOM query, so they are skipped or navigated past incorrectly.

2. **Amount and date cells receive `onTab={undefined}`** — `EditableCell` passes its own (prop-level) `onTab`/`onEnter` to `DatePickerCell` and `AmountInput`, but parent components (`MovementsTable`, `BudgetItemRow`) never pass those props. These cells call `e.preventDefault()`, then call `onTab?.(shift)` — which is a no-op. Navigation stops.

3. **Category `<select>` Tab is consumed by the browser** — Native `<select>` Tab is handled at the OS level before React's synthetic `onKeyDown` can bubble to the wrapper `div`. The wrapper's `handleKeyDown` never fires for Tab.

4. **Enter has no navigation fallback** — In `handleKeyDown` for text/category cells, `onEnter?.()` is called, but is always `undefined` at every call site. Enter saves the cell but leaves focus in place.

5. **Actions column is in the native Tab sequence** — `RowActionsMenu` trigger button (and other interactive elements: `ExternalLink` links, Sync/Unsync buttons, `ConfirmButton`) have no `tabIndex`, so they sit between rows in the natural Tab order with no way back to the editable cells.

## Proposed Solution

Fix each bug at its source, keeping the existing `focusAdjacentCell` DOM-query architecture:

1. Wrap `DatePickerCell` in `EditableCell`'s `type="date"` branch with a `cellRef`-attached div carrying `data-editable-cell`.
2. Pass `focusAdjacentCell` as the fallback `onTab`/`onEnter` handler from `EditableCell` to all child editor components.
3. Add `onTab`/`onEnter` props to `CategorySelect` and handle them on the `<select>` element's own `onKeyDown`.
4. Wire `focusAdjacentCell` as the fallback for Enter in `handleKeyDown` (text/category branch).
5. Add `tabIndex={-1}` to every interactive element in the actions column of both tables.
6. Restructure the Tab `e.preventDefault()` call to only fire when a next cell exists — enabling natural Tab exit from the last cell.

## Tab Sequence (confirmed in brainstorm)

- **MovementsTable row:** description → date → amount_cents → category_id
- **BudgetItemRow:** description → date → amount_cents → amount_usd → accounting_date
- End of row wraps to first cell of next row
- End of last row: Tab exits the table naturally (focus goes to next focusable element on page)
- Shift+Tab from first cell of first row: exits the table naturally (same mechanism)
- Frozen/disabled cells are already excluded via `data-disabled` attribute
- Actions column: fully excluded via `tabIndex={-1}`

## Technical Approach

### Bug 1 + Bug 2: `EditableCell.tsx` — date branch wrapper + callback threading

For `type="date"`, add a wrapping div with `cellRef` and `data-editable-cell`. Also change the `onTab`/`onEnter` props passed to `DatePickerCell` and `AmountInput` from the raw prop values (which are always `undefined`) to a fallback that calls `focusAdjacentCell`:

```tsx
// type="date" branch — add wrapper div
if (type === 'date') {
  return (
    <div ref={cellRef} data-editable-cell>
      <DatePickerCell
        value={value}
        onSave={(v) => { onSave(v); setEditing(false) }}
        onCancel={() => { setDraft(value); setEditing(false) }}
        onTab={onTab ?? ((shift) => focusAdjacentCell(shift))}
        onEnter={onEnter ?? (() => focusAdjacentCell(false))}
      />
    </div>
  )
}

// type="amount" branch — same pattern for onTab/onEnter
if (type === 'amount') {
  return (
    <div ref={cellRef} data-editable-cell>
      <AmountInput
        value={value}
        onSave={(v) => { onSave(v); setEditing(false) }}
        onCancel={() => setEditing(false)}
        onTab={onTab ?? ((shift) => focusAdjacentCell(shift))}
        onEnter={onEnter ?? (() => focusAdjacentCell(false))}
        className={className}
      />
    </div>
  )
}
```

### Bug 3 + Bug 4: `CategorySelect.tsx` — add `onTab`/`onEnter` props

Replace the wrapper-div-level keydown workaround (which doesn't fire for `<select>` Tab) with direct handling on the `<select>` element:

```tsx
interface CategorySelectProps {
  value: string | null
  onChange: (id: string | null) => void
  autoFocus?: boolean
  onTab?: (shift: boolean) => void    // new
  onEnter?: () => void                // new
}

// Inside <select> element:
onKeyDown={(e) => {
  if (e.key === 'Tab') {
    e.preventDefault()
    onTab?.(e.shiftKey)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    onEnter?.()
  }
}}
```

Update `EditableCell`'s category branch to pass these callbacks:

```tsx
if (type === 'category') {
  return (
    <div ref={cellRef} data-editable-cell onBlur={save}>
      <CategorySelect
        value={categoryId ?? null}
        onChange={(id) => { onSave(id ?? ''); setEditing(false) }}
        autoFocus
        onTab={onTab ?? ((shift) => focusAdjacentCell(shift))}
        onEnter={onEnter ?? (() => focusAdjacentCell(false))}
      />
    </div>
  )
}
```

Note: remove the `onKeyDown={handleKeyDown}` from the wrapper div in the category branch — it is replaced by the `<select>`-level handler. Keep `onBlur={save}` for click-away saves.

### Bug 4 (cont.): `EditableCell.tsx` — Enter fallback in text branch

The text `handleKeyDown` calls `onEnter?.()` which is always `undefined`. Add a fallback:

```tsx
} else if (e.key === 'Enter') {
  e.preventDefault()
  save()
  if (onEnter) {
    onEnter()
  } else {
    focusAdjacentCell(false)
  }
}
```

### Bug 5: Actions column — `tabIndex={-1}` everywhere

**`RowActionsMenu.tsx`** — trigger button:
```tsx
<button tabIndex={-1} className="rounded p-1 ...">
  <MoreHorizontal size={16} />
</button>
```
The `ConfirmButton` that replaces the menu during delete confirmation also needs `tabIndex={-1}` — pass it through as a prop or add directly.

**`MovementsTable.tsx`** — actions column:
- `ExternalLink` / `<Link>` for budget-managed rows: add `tabIndex={-1}`

**`BudgetItemRow.tsx`** — actions column:
- `<Link>` (external link icon): `tabIndex={-1}`
- Unsync `<button>`: `tabIndex={-1}`
- Sync `<button>`: `tabIndex={-1}`
- `ConfirmButton` (trash): `tabIndex={-1}`

### Natural Tab exit from boundary cells

Currently `e.preventDefault()` is called before checking whether a next cell exists, so Tab from the last cell strands focus. Fix by checking first:

```tsx
} else if (e.key === 'Tab') {
  const hasPeer = hasAdjacentCell(e.shiftKey)
  if (hasPeer) {
    e.preventDefault()
    save()
    focusAdjacentCell(e.shiftKey)
  } else {
    // Let browser handle natural exit; still save the current value
    save()
    // Do NOT call e.preventDefault() — Tab moves focus naturally
  }
}
```

Extract a `hasAdjacentCell(shift)` helper from `focusAdjacentCell` that does the same DOM query but returns a boolean instead of clicking. Or refactor `focusAdjacentCell` to return whether it navigated:

```tsx
const focusAdjacentCell = useCallback((shift: boolean): boolean => {
  const cell = cellRef.current
  if (!cell) return false
  const table = cell.closest('[data-editable-table]')
  if (!table) return false
  const cells = Array.from(table.querySelectorAll<HTMLElement>('[data-editable-cell]:not([data-disabled])'))
  const idx = cells.indexOf(cell)
  if (idx < 0) return false
  const next = cells[shift ? idx - 1 : idx + 1]
  if (next) {
    setTimeout(() => next.click(), 0)
    return true
  }
  return false
}, [])
```

Then in `handleKeyDown`:
```tsx
} else if (e.key === 'Tab') {
  const navigated = focusAdjacentCell(e.shiftKey)  // check + navigate in one call
  if (navigated) {
    e.preventDefault()
    save()
  } else {
    save()  // exits edit mode; browser Tab exits table naturally
  }
}
```

Wait — there is a subtle ordering issue: `save()` must be called synchronously before focus moves away, but `focusAdjacentCell` defers the click via `setTimeout(..., 0)`. So calling navigate-then-save is fine because the deferred click fires after the current event loop turn. The restructured order `navigated = focusAdjacentCell(...)` → `if (navigated) { e.preventDefault(); save() }` works correctly.

Apply this same pattern to `DatePickerCell.tsx` and `AmountInput.tsx` for their own Tab handlers (they also call `e.preventDefault()` unconditionally today).

> **Implication for DatePickerCell and AmountInput:** these components need their `onTab` callbacks to indicate whether navigation happened. The simplest approach: have `EditableCell` always provide an `onTab` that calls `focusAdjacentCell` and returns the boolean; the child components call `e.preventDefault()` only if `onTab` succeeded. Alternatively, `DatePickerCell`/`AmountInput` can be simplified: always call `onTab?.(shift)` and always call `e.preventDefault()` — because if `onTab` is always provided (via the fallback threading from EditableCell), the "no next cell" case is handled inside `focusAdjacentCell` which is now in `EditableCell`. This means `DatePickerCell` and `AmountInput` do not need to change their `e.preventDefault()` placement — only `EditableCell`'s text/category `handleKeyDown` needs the restructure.
>
> On further analysis: for amount/date cells, `e.preventDefault()` in the child and then `onTab?.()` calling `focusAdjacentCell` is fine — even if `focusAdjacentCell` finds no next cell, we've already suppressed Tab and the cell saves. The cell enters a saved-but-focused-nowhere state. This is acceptable behavior (same as most spreadsheets: Tab from the last cell does nothing visible). If truly natural exit is desired from amount/date cells too, the `onTab` prop would need to return a boolean. This adds complexity. **Recommendation: natural exit behavior (not calling `e.preventDefault()`) only applies to the text/category handleKeyDown path in `EditableCell`. For amount/date cells controlled by `AmountInput`/`DatePickerCell`, Tab always suppresses the browser but navigation may stop at the last cell — this is acceptable and keeps the child components simpler.**

### Virtualization edge case (MovementsTable)

With `overscan: 20`, rows stay mounted 20 rows beyond the viewport. Normal Tab navigation (one cell at a time) will not trigger this. If Tab reaches row N where row N+1 is not yet mounted, `focusAdjacentCell` finds no next cell and returns `false`. The cell saves, the table Tab-exits (or stays, per above). This is acceptable for now.

A full fix would require passing a `onNavigateBeyondRange` callback from `MovementsTable` into `EditableCell`, calling `virtualizer.scrollToIndex(nextRow)` then retrying after a `requestAnimationFrame`. This is out of scope for this fix — it only matters for users navigating rapidly past the overscan boundary without scrolling, which is an uncommon edge case.

## Acceptance Criteria

- [ ] Tab from a description cell moves focus to the date cell in the same row (enters edit mode)
- [ ] Tab from a date cell moves focus to the amount cell in the same row
- [ ] Tab from an amount cell moves focus to the category (MovementsTable) or next amount/date (BudgetItemRow)
- [ ] Tab from the last editable cell in a row moves to the first editable cell of the next row
- [ ] Tab from the last editable cell in the last row exits the table (focus goes to next page element)
- [ ] Shift+Tab reverses all of the above
- [ ] Shift+Tab from the first editable cell of the first row exits the table
- [ ] Enter from any editable cell saves and advances to the next editable cell (same as Tab)
- [ ] The ellipsis menu trigger button is never reached via Tab
- [ ] No other action-column elements (links, sync buttons, confirm buttons) appear in Tab sequence
- [ ] The date picker calendar closes when Tab is pressed; navigation moves to the next cell
- [ ] Frozen/disabled rows are skipped in Tab navigation
- [ ] Tab navigation works the same in both MovementsTable and BudgetDetail/BudgetItemRow

## Files to Change

| File | Change |
|---|---|
| `src/components/EditableCell.tsx` | Add `data-editable-cell` wrapper div for `type="date"`; thread `focusAdjacentCell` as `onTab`/`onEnter` fallback for all child types; refactor text/category `handleKeyDown` to pass `focusAdjacentCell` as Enter fallback; restructure Tab to not call `e.preventDefault()` when at table boundary |
| `src/components/CategorySelect.tsx` | Add `onTab` and `onEnter` props; handle them on the `<select>` element's `onKeyDown` |
| `src/components/RowActionsMenu.tsx` | Add `tabIndex={-1}` to the trigger button; propagate to `ConfirmButton` as needed |
| `src/components/MovementsTable.tsx` | Add `tabIndex={-1}` to `ExternalLink` / `<Link>` in the actions column |
| `src/components/BudgetItemRow.tsx` | Add `tabIndex={-1}` to all interactive elements in the actions column (Link, Sync button, Unsync button, ConfirmButton) |

`DatePickerCell.tsx` and `AmountInput.tsx` **do not need changes** — they already handle Tab/Enter correctly once they receive non-undefined `onTab`/`onEnter` from `EditableCell`.

## Edge Cases and Known Limitations

- **Invalid date text + Tab:** If the user types a malformed date string and presses Tab, `DatePickerCell`'s `picker.selectedDate` will be null. `wrappedOnSave` is not called, but `onTab?.()` still fires and navigation proceeds. The cell's old value is restored by `wrappedOnCancel` via the 150ms blur handler (since `savedRef.current` is false). This is acceptable behavior: navigate forward, restore old value.
- **Double-save on blur-after-Tab (AmountInput):** `AmountInput` has both a Tab handler (`save()` then `onTab?.()`) and `onBlur={save}`. These may fire in sequence. The second `save()` call checks `draft !== value` — if the parent has re-rendered with the new value, this is a no-op. If not, it may send a duplicate. This is a pre-existing issue not introduced by this fix.
- **Virtualization boundary:** Cells in rows beyond overscan=20 are not in the DOM; `focusAdjacentCell` cannot reach them. This is noted but out of scope.
- **Arrow key navigation:** Not in scope for this fix.
- **ARIA grid roles:** Not in scope; could be a follow-up.
- **Mobile:** No change to mobile behavior.

## Dependencies & Risks

- **`DatePickerCell` wrapper div and blur propagation:** Adding a wrapper div around `DatePickerCell` for `data-editable-cell` may affect the 150ms blur handler inside `DatePickerCell`, which checks `inputRef.current` and `dropdownRef.current` to detect outside clicks. The wrapper div is not `inputRef` or `dropdownRef`, so blur from clicking the wrapper should correctly trigger the outside-click path. Low risk, but verify.
- **`CategorySelect` `onKeyDown` on `<select>` for Tab:** This approach is well-supported across browsers. Unlike wrapper-div Tab interception (which browsers prevent), `onKeyDown` on the `<select>` itself fires before the browser moves focus, making `e.preventDefault()` effective. Verify in Safari, which historically has quirks with `<select>` events.

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-04-02-keyboard-navigation-brainstorm.md](../brainstorms/2026-04-02-keyboard-navigation-brainstorm.md)
  - Key decisions carried forward: chosen approach A (wire up callbacks + tabIndex=-1); Tab sequence per row type; Enter = same as Tab; natural exit at table boundaries
- `src/components/EditableCell.tsx` — central keyboard logic and `focusAdjacentCell`
- `src/components/DatePickerCell.tsx` — date input with calendar popup
- `src/components/AmountInput.tsx` — numeric input with Tab/Enter handling
- `src/components/CategorySelect.tsx` — plain `<select>` wrapper
- `src/components/RowActionsMenu.tsx` — Radix dropdown trigger (actions column)
- `src/components/MovementsTable.tsx` — virtualized table with TanStack Virtual
- `src/components/BudgetItemRow.tsx` — budget item row with multiple editable cells
