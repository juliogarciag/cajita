---
topic: Annual Budgets with Sync to Accounting
date: 2026-03-09
status: complete
---

# Annual Budgets with Sync to Accounting

## What We're Building

A budget system where the user creates annual budgets (e.g., "Goodies", "Health", "Puppy") with a fixed annual amount in USD. Each budget has a list of expense items that can be tracked in local currency (Peruvian soles) and USD. When ready, individual items are "synced" to the main movements table (accounting), creating a linked movement.

Each budget also auto-manages an EOY "[Remaining] Budget Name" movement in the main table, computed as `annual_budget - sum(all items)` — regardless of sync status. This gives an always-accurate EOY projection.

## Why This Approach

**Approach chosen: Separate entity with sync link (A)**

Budgets and budget items are their own tables, with a FK link from budget items to movements when synced. This was chosen over:

- **Enriched categories (B):** Would overload the movement model with "not yet real" movements and muddy the category concept.
- **Fully separate (C):** No link means no auto-update when editing synced items and no freeze awareness.

The linked approach gives clean separation of concerns while enabling:
- Auto-update of the accounting movement when a budget item is edited (if not frozen)
- Freeze awareness via the existing checkpoint system
- Independent lifecycle for budget items (soles tracking, sync status)

## Key Decisions

1. **Currency model:** Expenses are tracked in soles (optional, informational) and USD (required before syncing). The main movements table stays USD-only. No exchange rate tracking — the user enters the USD amount manually once known.

2. **EOY remaining calculation:** `annual_budget - sum(all budget items)`, regardless of sync status. Adding any item to the budget immediately reduces the remaining amount.

3. **EOY movement in accounting:** One movement per budget, named "[Remaining] Budget Name", dated Dec 31 (or budget year-end). Auto-managed — updates whenever items change.

4. **Sync behavior:** Syncing a budget item creates a movement in the main table and links back via FK. The item stays in the budget list, marked as synced. An "accounting date" determines the movement's date.

5. **Post-sync editing:** If the linked movement is unfrozen, editing the budget item auto-updates the movement. If the movement is behind a checkpoint (frozen), the budget item is also locked.

6. **Budget ↔ Category relationship:** Each budget maps to a category (budgets like "Goodies" correspond to the existing "Goodies" category). Synced movements get that category automatically.

## Resolved Questions

1. **Do budgets always map 1:1 to categories?** Yes — every budget is linked to exactly one category. Synced movements inherit that category.
2. **Year rollover?** Start fresh each year. No carry-over mechanism needed.
3. **Can a budget item split into multiple movements?** Not needed now — keep it 1:1 for simplicity.
