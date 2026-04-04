---
date: 2026-04-03
topic: movement-notes
---

# Movement Notes

## What We're Building

A single rich-text note field on each movement and budget item. Users can open a Radix UI popover from the row, write or edit a note using Tiptap (WYSIWYG markdown editor), and the note is saved along with the user_id of whoever last edited it. The author's current name is always shown by joining to the users table.

Notes are a simple annotation — not a comment thread. Last writer wins.

## Why This Approach

- **Single note, not threads:** Keeps the data model simple. Comment threads would be a separate feature.
- **Radix Popover:** Consistent with existing Radix UI usage (DropdownMenu, Tooltip). Anchors cleanly to the row without blocking the rest of the table.
- **Tiptap:** Most mature React WYSIWYG editor. Supports markdown shortcuts, link insertion, bold/italic — enough for a useful note field without being heavy.
- **user_id stored, not name snapshot:** Author name always reflects current profile. One extra join, but keeps data consistent.
- **Anyone on the team can edit:** Author name is metadata for context, not a permission gate. Simpler and more collaborative.

## Key Decisions

- **Data model:** Two dedicated join tables — `movement_notes` and `budget_item_notes` — each with a UNIQUE FK back to their parent, enforcing 1-1 forever. No columns added to `movements` or `budget_items`. Notes are first-class entities: `id`, `content`, `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`.
- **Creator vs. editor:** `created_by_user_id` is set once on insert and never changed. `updated_by_user_id` is overwritten on every save. Both are FKs to `users`.
- **Author display:** Both names resolved via the team-members collection. Show "Created by [name] · Edited by [name] · [relative time]" (or just "Created by [name] · [relative time]" if never edited by someone else).
- **Editor:** Tiptap with StarterKit + Link extension. Minimal toolbar: bold, italic, link.
- **Popover trigger:** Small note icon in the row actions area. Filled/colored if a note exists, muted if empty.
- **Sync:** Notes on movements go through the existing `updateMovement` server function. Notes on budget items go through `updateBudgetItem`. ElectricSQL syncs the new columns automatically once they're in the shape.
- **Frozen rows:** Notes can still be edited on frozen (checkpointed) movements — freezing locks financial data, not annotations.

## Resolved Questions

- **Note icon visibility:** Show on every row. More discoverable. Icon is muted/empty when no note exists, filled/colored when a note is present.

## Next Steps

→ `/ce:plan` for implementation details
