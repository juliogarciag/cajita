# Reconciliation Checkpoints

**Date:** 2026-03-09
**Status:** Draft

## What We're Building

A way to "freeze" movements up to a specific row after verifying the running total matches reality (bank + cash). This prevents accidental edits or insertions into already-reconciled history.

### User workflow

1. Periodically sync with bank account, enter any missing movements
2. Look at the running total on the last synced row
3. Click an action on that row -> enter the real bank+cash balance
4. System compares real balance to running total, shows any discrepancy
5. User confirms -> everything at or before that row becomes read-only
6. A visual divider appears below the frozen boundary

## Why This Approach

**Checkpoint on row** was chosen over special rows or a separate panel because:

- It's the most natural interaction: you're already looking at the row you want to checkpoint
- The freeze boundary is always visible in context while scrolling
- It keeps the movements table clean (no mixed row types)
- Checkpoint metadata lives in its own table, not cluttering movements

## Key Decisions

1. **Real balance is required** — You must enter the actual bank+cash amount to create a checkpoint. This is the proof that the ledger is correct at that point.

2. **Freeze is on a row, not a date** — The checkpoint is tied to a specific movement (by ID), not just a date. This handles multiple movements on the same date correctly.

3. **Frozen means read-only** — Movements at or before the checkpoint cannot be edited or deleted. New movements cannot be inserted before the checkpoint. The UI grays them out and disables editing.

4. **Unfreezing is possible but deliberate** — A small action on the checkpoint boundary lets you unfreeze, but behind a confirmation dialog to prevent misclicks.

5. **Only one active checkpoint** — The latest checkpoint is the active freeze boundary. Creating a new one supersedes the old one (old ones are kept as history).

6. **Discrepancies are shown, not blocked** — If real balance != running total, show the difference but still allow checkpointing. The user might add an adjustment row or accept the drift.

## Data Model

### New table: `checkpoints`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| movement_id | UUID | The movement row this checkpoint is anchored to (FK) |
| expected_cents | INTEGER | The running total at this movement (computed at checkpoint time) |
| actual_cents | INTEGER | The real bank+cash balance entered by the user |
| created_at | TIMESTAMPTZ | When the checkpoint was created |

### Behavior

- **Latest checkpoint** = the one with the most recent `created_at`
- **Frozen movements** = all movements with `(date, sort_position) <= checkpoint movement's (date, sort_position)`
- **Unfreeze** = delete the latest checkpoint (with confirmation)
- No changes to the movements table schema

## UI Behavior

### Creating a checkpoint
- Each row gets a small action (e.g., in a context menu or a lock icon that appears on hover)
- Clicking it opens a small inline dialog or popover: "Enter real balance: $___"
- Shows: Expected (running total), Actual (user input), Difference
- Confirm button creates the checkpoint

### Frozen state
- Rows at or before the checkpoint are visually muted (lighter text, no hover highlight)
- EditableCell becomes non-interactive for frozen rows
- Delete button is hidden for frozen rows
- A subtle divider line or badge marks the freeze boundary
- "Add Movement" always inserts after the checkpoint

### Unfreezing
- A small "unfreeze" action appears at the checkpoint boundary row
- Clicking shows: "This will unlock X movements for editing. Are you sure?"
- Confirming deletes the latest checkpoint

## Open Questions

None — all questions resolved during brainstorming.
