# Brainstorm: Financial Movements Tracker

**Date:** 2026-03-08
**Status:** Draft
**Context:** Replace Google Sheets-based financial movements tracking with an in-app feature in cajita

## What We're Building

A financial movements tracker inside cajita that replaces the current Google Sheets workflow. It manages a single, continuous chronological list of financial movements (income and expenses) with a running total (cumulative balance), inline editing, and snapshot-based backup/recovery.

### Core Functionality

- **Single continuous list** of all movements across all years (no more splitting by year)
- **Columns:** Description, Date, Amount (+/-), Running Total (computed), Budget/Category
- **Inline editing** — edit any cell directly in the table, Google Sheets-style
- **Add/delete rows** inline
- **Filter by time range** (month, year, custom) with correct running totals
- **Filter by category** (shows amounts only, no running total — it doesn't make sense without time ordering)
- **~400-500 movements/year**, currently ~1,300+ total across 3 years. Two users.

### Running Total Strategy: Frontend Compute

The running total is **not stored in the database**. Only `amount` is persisted.

**How it works:**
1. All movements are loaded from the API sorted by date
2. Frontend computes the running total with a simple `reduce()` over the sorted array
3. On any edit (amount change, row add/delete), totals recompute instantly in memory (<1ms for 10K+ items)
4. **Virtualized rendering** (TanStack Virtual) ensures only ~40 visible rows are in the DOM at any time, regardless of dataset size
5. Time-range filters slice the already-computed array — totals remain correct

**Why this works at scale:**
- 10K rows = ~1MB in memory, loads in milliseconds
- Running total computation: <1ms for 10K items
- Only visible rows are rendered (virtualization)
- Same pattern used by Google Sheets, Excel Online, etc.

### Backup & Recovery: Automatic Daily + Manual Snapshots

- **Automatic daily snapshots** — system creates a frozen copy of all movements every day
- **Manual snapshots** — user can press a button to create a named snapshot at any time
- **Restore flow:** Full restore with diff view — user sees what changed between current state and the snapshot before confirming the restore
- **Implementation:** Snapshots are stored as JSON blobs in the DB (movements table is small enough). Each snapshot records: timestamp, name (optional), full movements data.

### Inline Editing UI

- Table-based UI with editable cells (click to edit, Tab/Enter to navigate)
- Optimistic updates — changes reflect instantly, sync to server in background
- Row actions: delete (with confirmation), add new row
- Category selection via dropdown (mostly fixed set of ~10-15 categories)

## Why This Approach

1. **Frontend compute for totals** eliminates the consistency problem entirely — no stale totals, no recalculation cascades, no race conditions between users
2. **Loading all data** is viable because the dataset is tiny (~1MB even at 50 years of data) and avoids pagination complexity
3. **Virtualization** decouples data size from rendering performance
4. **Snapshots as JSON blobs** are simple to implement and provide the safety net without complex event sourcing or audit logs
5. **Building inside cajita** reuses existing auth (Google OAuth), database (PostgreSQL + Kysely), and deployment (Railway)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Running total storage | Computed client-side, not stored | Eliminates consistency issues, trivial at this scale |
| Data loading | Load all movements at once | <1MB total, simpler than pagination, enables correct filtered totals |
| Rendering | Virtualized list (TanStack Virtual) | Handles 10K+ rows with only ~40 DOM nodes |
| Backup model | Auto daily + manual snapshots | Balances convenience with control |
| Restore UX | Full restore with diff preview | Safe — user sees changes before committing |
| App location | Feature within cajita | Reuse existing stack, auth, DB, deployment |
| Category management | Mostly fixed set, stored in DB | Rarely changes, simple enum-like table |
| Inline editing | Optimistic updates | Instant feel, sync in background |
| Same-date ordering | Insertion order + drag-and-drop | Default is simple, reordering available when needed |
| Snapshot retention | 90 days auto, manual forever, pin to keep | Balances storage with safety; pinning prevents accidental loss |

## Tech Stack (within cajita)

- **Frontend:** React + TanStack Start + TanStack Virtual + Tailwind
- **Backend:** Nitro server functions + Kysely queries
- **Database:** PostgreSQL (existing) — new `movements`, `categories`, `snapshots` tables
- **No new dependencies** beyond TanStack Virtual for the virtualized list

## Future Extensibility (Not in Scope Now)

- **Budget tracking:** Annual budgets with their own movement lists, synced to main table when paid
- **Reports/charts:** Monthly summaries, category breakdowns, trends
- **Import from Sheets:** Bulk import existing Google Sheets data
- **Multi-currency support**

## Resolved Questions

1. **Sort order for same-date movements:** Insertion order by default, but support drag-and-drop reordering within the same date. This means an explicit `sort_position` field in the DB.
2. **Snapshot retention:** Automatic daily snapshots kept for 90 days, then auto-pruned. Manual snapshots kept forever. Users can "pin" (convert) an automatic snapshot to make it permanent.

## Open Questions

None — all questions resolved.
