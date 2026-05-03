---
date: 2026-05-03
topic: finance-search
---

# Finance Search (Cmd+K Palette)

## What We're Building

A global search palette that finds movements and budget items across the whole app — by description, by their attached note's content, and by amount. Triggered from a keyboard shortcut (Cmd+K), opens an overlay with a single text input and a ranked, mixed list of results. Each result has a type badge (`Movement` or `Budget item`) and clicking navigates to the row in its native context (the movements table or the parent budget detail), highlighting it on arrival.

Search is client-side over already-synced TanStack DB collections — no new server endpoints. The data scale (one team, finance-app density) makes in-memory filtering trivially fast.

## Why This Approach

- **Cross-domain palette over per-list filters:** The user picks a movement or budget item by recall, often without remembering which budget it lived in. A global palette short-circuits navigation; per-list filters force you to know the right list first.
- **Client-side filter over a server search endpoint:** All the data is already on the client via Electric. A server endpoint would duplicate the index without a real performance benefit at this scale and would force two code paths (live + non-live).
- **Single mixed list over grouping or tabs:** A personal-finance dataset rarely returns more than a handful of hits. Mixed ranking puts the best match on top regardless of type. Type badges give the visual cue with zero extra layout. Grouping/tabs can be added later if results ever get noisy — YAGNI.
- **No multi-currency model in the schema:** Movements are USD-only (`amount_cents`); only `budget_items.amount_local_cents` carries an optional Soles amount, with no FX rate stored. So "any currency" reduces to: a bare numeric query matches either field.

## Key Decisions

- **Scope:** Searches across `movements` (description + their `movement_notes.content`) and `budget_items` (description + their `budget_item_notes.content`). Categories, budgets-as-containers, and scenarios are not in v1.
- **Trigger:** Cmd+K (and Ctrl+K on non-mac) opens the palette. Esc closes. Open from anywhere in the app.
- **Result presentation:** Single mixed list, ranked by relevance, capped at ~30 results. Each row shows: type badge, primary text (description with matched term highlighted), date, formatted amount, a snippet of matching note content if the match was on the note. Click or Enter navigates.
- **Text matching:** Case-insensitive substring across description and note `content`. Multi-word query is AND across tokens; each token can match either the description or the note. Token highlighting in the displayed text.
- **Amount matching:** If the query (or a token within it) parses as a number, additionally surface records whose `|amount_cents|` equals that number, OR (for budget items only) whose `|amount_local_cents|` equals that number. Sign-agnostic; `1500` and `-1500` match the same set. Bare integer `1500` is interpreted as $1,500.00 / S/. 1,500.00 — i.e. cents = number * 100. Decimal forms like `1500.50` parse to the obvious cents value. Combine with text matching as an OR within the same query (a token that is a number contributes both its text-substring match and its numeric match).
- **Navigation:**
  - Movement → `/finances/movements?highlight=<id>` (existing `?highlight=` param already does scroll-and-flash).
  - Budget item → `/finances/budgets/$budgetId?highlightItem=<id>` (mirror the same scroll-and-flash; the budgetId comes from the budget_item itself).
- **Empty state:** When the input is empty, show nothing (no recent-items list in v1). When the input has text but no matches, show "No movements or budget items match." Show a tiny hint: "Tip: type a number to search by amount."
- **Source of truth:** Search reads only what's already in the TanStack DB collections (`movementsCollection`, `movementNotesCollection`, `budgetItemsCollection`, `budgetItemNotesCollection`). No new server function needed.

## Resolved Questions

- **Match-rank tie-breaker:** Most-recent date descending. Reflects "what I worked on lately is what I'm probably looking for."
- **Note-only matches:** Show a short note excerpt (~80 chars around the first hit) with the matched term highlighted. Makes it obvious why a row matched on a note-only query.
- **Frozen / archived items:** Included in results. Search is for recall — old stuff is exactly what you might want to revisit.
- **Top-bar entry point:** Right side of the top nav, just before the user name and Logout. Compact button: search icon + "Search" label + ⌘K hint chip. Matches Linear / Notion / GitHub patterns.
- **Keyboard navigation inside the palette:** Arrow keys to move selection, Enter to open, Esc to close. No Tab handling — keep the surface small.
- **Mobile / narrow viewport:** Out of scope for v1. The top-nav button taps to open the same palette on mobile, but a properly tuned full-screen mobile variant is a follow-up.

## Open Questions

_(none blocking implementation — proceed to planning)_

## Next Steps

→ `/ce:plan` for implementation details.
