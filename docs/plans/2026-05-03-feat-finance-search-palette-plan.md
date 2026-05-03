---
title: "feat: Global Cmd+K search palette across movements and budget items"
type: feat
status: completed
date: 2026-05-03
origin: docs/brainstorms/2026-05-03-finance-search-brainstorm.md
---

# feat: Global Cmd+K Search Palette Across Movements and Budget Items

## Overview

Add a global, keyboard-first search palette that finds movements and budget items by description, by their attached note's content, and by amount. Triggered with `⌘K` (or `Ctrl+K`) from anywhere inside the authenticated app, or from a small `Search` button placed at the right of the top nav, just before the user name. Results are a single mixed list ranked by relevance (description hits beat note hits beat amount hits, ties broken by most-recent date), capped at 30. Each row shows a type badge (`Movement` / `Budget item`), the matched description with terms highlighted, the row's date, the formatted amount, and — when the match is on the note — a short note excerpt. Clicking a result navigates to the row in its native context (movements table or parent budget detail) with the existing scroll-and-flash highlight.

Implemented client-side over the already-synced TanStack DB collections — no new server endpoints, no new tables, no schema changes.

(see brainstorm: docs/brainstorms/2026-05-03-finance-search-brainstorm.md)

## Problem Statement / Motivation

The Movements table is one large virtualized list ordered by date. Budget items live behind a `Budgets → $budgetId` drilldown. Today there is no way to "go find that one movement / item I remember" without scrolling, recalling its date, or knowing which budget owns it. As the dataset grows the recall problem only gets worse.

A global palette short-circuits navigation: type a few characters, hit Enter, land on the row. Per-list filters were rejected because they force the user to know which list to look in first — exactly the wrong premise for recall (see brainstorm: "Why This Approach").

## Proposed Solution

Eight focused changes, in dependency order:

1. **Add `cmdk` dependency.** Single small package; provides accessible combobox + listbox primitives with built-in keyboard navigation. We disable its built-in filter (`shouldFilter={false}`) and provide our own ranked list — `cmdk` handles roles, focus, arrow keys, Enter, Esc, and the modal Dialog.
2. **Pure search/rank module** at `src/lib/search.ts`: tokenization, amount-token parsing, the candidate-scoring loop, and small text utilities (escape regex, build excerpt). Zero React. Unit-testable.
3. **`<HighlightedText>`** component at `src/components/search/HighlightedText.tsx`: renders text with `<mark>` segments for matched tokens.
4. **`<SearchPalette>`** component at `src/components/search/SearchPalette.tsx`: the `cmdk` Dialog + input + list. Mounts when `open === true`. Subscribes to the four collections via `useLiveQuery`, debounces input (~120ms), feeds the search function, renders results, navigates on Enter / click.
5. **`<SearchButton>`** component at `src/components/search/SearchButton.tsx`: the top-nav trigger (search icon + label + `⌘K` chip).
6. **Wire the palette into `AuthenticatedLayout`** in `src/routes/_authenticated.tsx`: own `searchOpen` state, render `<SearchButton>` in the right group of the nav, render `<SearchPalette>` at the layout root, register the global `⌘K` / `Ctrl+K` keydown listener.
7. **Add `highlightItem` to budget detail.** Extend `validateSearch` in `src/routes/_authenticated/finances/budgets/$budgetId.tsx` and add a sibling scroll-and-flash effect in `src/components/BudgetDetail.tsx` that finds the row by `item.id` directly (the existing `highlight` param interprets its value as a `movement_id`; do not overload it).
8. **Smoke test** in the browser preview: open with ⌘K, search for description, note content, and amount; navigate to both a movement and a budget item; confirm flash. Confirm `npx tsc --noEmit` and `npm run build`.

---

## Technical Considerations

### Dependencies

- **Add:** `cmdk` (latest, currently 1.x). One small dep, used by Linear / Vercel / Raycast. We rely on `Command.Dialog`, `Command.Input`, `Command.List`, `Command.Empty`, `Command.Item`. We override its filter so `cmdk` is just the primitive shell — our `runSearch` does the work.
- **Reuse:** existing Tailwind v4, `@tanstack/react-router`, `@tanstack/react-db`, `lucide-react` (for the search icon).
- **No removals.**

### State and lifecycle

State lives in `AuthenticatedLayout`:

```tsx
// src/routes/_authenticated.tsx
const [searchOpen, setSearchOpen] = useState(false)

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setSearchOpen((prev) => !prev)
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [])
```

`<SearchPalette>` is conditionally rendered (`{searchOpen && <SearchPalette open onOpenChange={setSearchOpen} />}`) — its live-query subscriptions only run while open. Closing the palette unmounts it and discards any input state, which is the conventional palette UX.

### Search algorithm

Pure, all client-side. `src/lib/search.ts` exports:

```ts
export type SearchResult =
  | { kind: 'movement'; movement: Movement; note?: MovementNote; score: number; descHits: string[]; noteHits: string[]; amountHits: string[] }
  | { kind: 'budget_item'; item: BudgetItem; note?: BudgetItemNote; budgetId: string; score: number; descHits: string[]; noteHits: string[]; amountHits: string[] }

export function runSearch(query: string, data: {
  movements: Movement[]
  movementNotes: MovementNote[]
  budgetItems: BudgetItem[]
  budgetItemNotes: BudgetItemNote[]
}): SearchResult[]
```

**Tokenization.** `query.trim().toLowerCase().split(/\s+/).filter(Boolean)`. Empty query → empty array → no results.

**Amount parsing.** A token is "numeric" if `parseFloat(token.replace(/[$,\s]/g, ''))` is finite. Sign-agnostic: we compare against `Math.abs(amount_cents)`. Decimal forms are rounded to cents: `Math.round(numeric * 100)`.

**Per-token scoring.** For each candidate (movement or budget item) and each token:

- Description substring match → `+3`, push token into `descHits`.
- Else note substring match → `+2`, push into `noteHits`.
- Else (numeric only) `Math.abs(amount_cents) === Math.round(numeric * 100)` → `+2`, push into `amountHits`. For budget items, also test `amount_local_cents` when present.
- Else: token unmatched → reject the candidate (AND across tokens).

**Final ordering.** `sort by (score desc, date desc)`. Slice to 30.

**Why this ranking?** Description matches are what the user typed in the input field — strongest signal. Notes are narrative, longer, weaker signal. Amount matches are precise but lose semantic context. Date desc as the tie-breaker is the brainstorm-resolved choice ("what I worked on lately is what I'm probably looking for").

### Note excerpt and highlighting

`buildNoteExcerpt(content: string, terms: string[]): string` — find the first index of any token, slice ~40 chars before and after, prepend/append `…` if truncated. Returned to `<HighlightedText>` along with the term list.

`<HighlightedText text={...} terms={[...]} />` — escape regex specials in terms, build `new RegExp(joined, 'gi')`, split-and-map producing alternating plain and `<mark className="bg-yellow-200 rounded px-0.5">…</mark>` segments. Used both for the description and for the note excerpt.

### Result row layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Movement]  Office supplies — Notion subscription                       │
│             Apr 14, 2026 · −$12.00                                      │
│             📝 "…paid via Stripe with the personal card…"               │
└─────────────────────────────────────────────────────────────────────────┘
```

- Type badge: small pill, `bg-blue-100 text-blue-700` for Movement, `bg-purple-100 text-purple-700` for Budget item.
- Description: bold-ish, single line, ellipsized.
- Date + amount row: muted text.
- Note excerpt (only when match was on the note): smaller, italic, with the matched term highlighted.

### Routing and navigation

- **Movement result.** `useNavigate({ to: '/finances/movements', search: { highlight: id } })`. The existing `?highlight=` flow in `src/routes/_authenticated/finances/movements.tsx:10-17` and `MovementsTable.tsx:246-272` already does scroll-to-row + 2s `bg-blue-100` flash. No changes needed there.
- **Budget item result.** `useNavigate({ to: '/finances/budgets/$budgetId', params: { budgetId: item.budget_id }, search: { highlightItem: id } })`. Two small additions:
  - Extend the route's `validateSearch` to accept `highlightItem: z.string().optional()` alongside the existing `highlight` param.
  - Add a sibling `useEffect` in `BudgetDetail.tsx` that, when `highlightItem` is set, finds the DOM node via `document.getElementById(highlightItem)` directly (no `movement_id` indirection), `scrollIntoView`, sets `highlightedItemId`, clears it after 2000ms — exact same pattern as the existing `highlight` effect (lines 103-116) but a different lookup.

The `highlightItem` name keeps the new path orthogonal to the existing `highlight` param (which means "find the budget item whose `movement_id` is X" — used for cross-links from the movements table). Repurposing `highlight` would require disambiguating IDs at runtime; not worth the contortion.

### UI placement in the top nav

`src/routes/_authenticated.tsx:30-113`. The right-group `<div className="flex items-center gap-3">` at line 59 currently holds: profile `<img>`, user name `<span>`, logout `<form>`. Insert `<SearchButton onClick={() => setSearchOpen(true)} />` as the first child of that div. The button:

- Pill / chip styling matching the muted nav aesthetic.
- `<SearchIcon size={14} />` from `lucide-react`, label "Search", a small `kbd` showing `⌘K` (or `Ctrl K` on non-mac via `navigator.platform`).
- Tooltip on hover: "Search (⌘K)".
- Keyboard-focusable; pressing Enter or Space opens the palette.

### Performance and scale

The palette reads four collections via `useLiveQuery` (movements, movement_notes, budget_items, budget_item_notes). On a typical Cajita dataset (single team, ~hundreds to low-thousands of movements over years, similar order of magnitude for items + notes), `runSearch` is O(N) per keystroke and runs in well under 1 ms on a modern CPU. Debounce input 120ms anyway to keep React rerenders sane.

Live-query subscriptions only mount while the palette is open — closing it tears them down.

### Edge cases

- **Empty input.** Render no results; `<Command.Empty>` is suppressed (it would only show after typing).
- **Whitespace-only input.** Same as empty.
- **Single token that's numeric.** Tries description, then note, then amount. Most natural: amounts are common short queries (e.g. `1200`).
- **Token contains regex specials.** Highlight regex must escape them. Use `term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.
- **Frozen movements.** Included. Brainstorm-resolved.
- **Items in archived categories.** Included. Brainstorm-resolved.
- **No matching note.** Don't render the snippet line.
- **Description is empty (shouldn't happen in practice).** Treated as no description match.
- **Two collections still loading.** Live queries return empty arrays initially; results are simply empty until the data arrives, which is fast (already-synced).

### Files to create

- `src/lib/search.ts` — pure search module + types.
- `src/components/search/SearchPalette.tsx` — palette component.
- `src/components/search/SearchButton.tsx` — top-nav trigger button.
- `src/components/search/HighlightedText.tsx` — text with `<mark>` segments.

### Files to modify

- `src/routes/_authenticated.tsx` — own `searchOpen` state, register the keydown listener, render `<SearchButton>` in the nav, render `<SearchPalette>` at layout root.
- `src/routes/_authenticated/finances/budgets/$budgetId.tsx` — extend `validateSearch` with `highlightItem`.
- `src/components/BudgetDetail.tsx` — sibling effect for `highlightItem` (direct id lookup).
- `package.json` / `package-lock.json` — add `cmdk`.

---

## System-Wide Impact

### Interaction graph

`⌘K` keydown → layout state flip → `<SearchPalette>` mount → 4 `useLiveQuery` subscriptions register against `@tanstack/react-db` collections (already populated from Electric) → input change → debounce → `runSearch` → React reconcile → `cmdk` re-renders the list. Enter on a result → `useNavigate` from TanStack Router → movements/budgets route activates → existing scroll-and-flash effect fires (or, for budget items, the new sibling effect).

No server functions involved. No mutations.

### Error propagation

The search path is pure JavaScript over already-synced data. The realistic failure modes are:

- A regex-construction throw if escaping is wrong → guarded by the `escape` helper; trivial unit test.
- A `useLiveQuery` collection still loading → returns `[]`; UI shows empty results, not an error.
- A navigate to a no-longer-existing row id (e.g. row deleted between search and click) → router navigates, target page renders without the highlighted row, no flash. Not an error state — silently degrades.

### State lifecycle risks

The palette has no persistent state. Closing discards input. No pending mutations. No risk of orphaned rows.

### API surface parity

No API surface changes. The internal collection-read API and route search params are the only affected surfaces and they're internal.

### Integration test scenarios

1. **Search by description, navigate to movement.** Type a unique description fragment; result appears with matched term highlighted; Enter routes to `/finances/movements?highlight=<id>`; row scrolls into view and flashes for 2s.
2. **Search by note content, navigate to budget item.** Create a note on a budget item with a unique phrase; search for it; result row shows the note excerpt with the matched term highlighted; Enter routes to `/finances/budgets/$budgetId?highlightItem=<id>`; row scrolls and flashes.
3. **Multi-token AND across description and note.** Description "Notion subscription" and note containing "annual"; search "notion annual"; the row appears (description matches first token, note matches second).
4. **Numeric token matches USD amount.** Search `1500` against a movement whose `amount_cents = -150000`; result appears with the description shown plain (no description match).
5. **Numeric token matches PEN amount on budget item only.** Search `4500` against a budget item whose `amount_local_cents = 450000` and `amount_cents` is something else; result appears.

---

## Acceptance Criteria

### Functional

- [x] `⌘K` (mac) or `Ctrl+K` (other) opens the palette from any authenticated route.
- [x] `Esc` closes the palette.
- [x] Top-nav `Search` button (right side, before user name) opens the same palette.
- [x] Button shows a `⌘K` (or `Ctrl K`) hint chip and a tooltip on hover.
- [x] Typing in the input runs the search debounced ~120ms.
- [x] Results are a single mixed list with type badges, ranked by score then date desc, capped at 30.
- [x] Description matches highlight matched tokens with `<mark>`.
- [x] When a result matched on its note (and not its description), the row shows a ~80-char excerpt of the note with matched terms highlighted.
- [x] Bare numeric tokens (e.g. `1500`, `1500.50`, `$1,500`) match `|amount_cents|` for movements and either `|amount_cents|` or `|amount_local_cents|` for budget items. Sign-agnostic.
- [x] Multi-word queries are AND across tokens (every token must match somewhere on the row).
- [x] Frozen movements and items in archived categories are included.
- [x] Arrow keys move selection; Enter activates; click also activates.
- [x] Activating a movement result navigates to `/finances/movements?highlight=<id>` and the existing scroll-and-flash highlight fires.
- [x] Activating a budget-item result navigates to `/finances/budgets/$budgetId?highlightItem=<id>` and a new sibling scroll-and-flash highlight fires.
- [x] Empty results (input has text but no hits) render `No movements or budget items match.` plus the tip `Tip: type a number to search by amount.`

### Quality gates

- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` succeeds.
- [x] Unit tests for `runSearch`: tokenization, AND semantics, amount matching (USD and PEN), ranking ties, frozen/archived inclusion.
- [x] No new console errors in the dev server logs while opening / typing / navigating.
- [x] No new server endpoints, no DB migration.

---

## Success Metrics

- The user can find any movement / budget item they remember a fragment of, in under 5 seconds, without knowing which budget owns it.
- The palette feels indistinguishable from Linear / Notion / Raycast palettes in basic interaction (open, type, arrow, enter).
- Zero impact on existing routes when the palette is closed (no extra subscriptions, no extra renders).

## Dependencies & Risks

- **`cmdk` is a new dependency.** Small (~5 KB), Radix-friendly, popular. Locking to the latest stable major.
- **In-memory client-side filter.** Will scale fine to ~10,000 records per collection. If the product ever holds materially more, we move ranking to a server endpoint backed by Postgres `pg_trgm` / FTS — flagged for the future, out of scope now.
- **Risk: `highlight` vs `highlightItem` confusion in budget detail.** Mitigated by keeping the two params strictly orthogonal (existing `highlight` = `movement_id` lookup; new `highlightItem` = `id` lookup) and by not modifying the existing effect.
- **Risk: keyboard handler colliding with browser-level shortcuts.** `⌘K` is widely understood as "search palette" and not bound by Chrome / Safari to anything user-facing. Listener uses `e.preventDefault()` only inside the palette context; outside, only `(metaKey || ctrlKey) && key === 'k'` is intercepted.

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-05-03-finance-search-brainstorm.md](../brainstorms/2026-05-03-finance-search-brainstorm.md). Key decisions carried forward: global ⌘K palette over per-list filters, single mixed list with type badges, bare numeric tokens match either currency, frozen/archived included, top-nav button on the right of the nav, mobile deferred.

### Internal references

- Top nav: `src/routes/_authenticated.tsx:30-113` (the `AuthenticatedLayout` component; right group at line 59 is the insertion point).
- Existing movements highlight: `src/routes/_authenticated/finances/movements.tsx:10-17` (validateSearch) and `src/components/MovementsTable.tsx:246-272` (effect) and `src/components/TableRow.tsx:26` (the `bg-blue-100` flash).
- Existing budget detail highlight (interpreted as `movement_id`): `src/components/BudgetDetail.tsx:103-116`. Sibling effect for `highlightItem` will live next to it.
- Live-query `.where()` precedent: `src/components/BudgetDetail.tsx:52-57` (`q.from(...).where(({ bi }) => eq(bi.budget_id, ...))`).
- Movements collection: `src/lib/movements-collection.ts`.
- Movement notes collection: `src/lib/movement-notes-collection.ts`.
- Budget items collection: `src/lib/budget-items-collection.ts`.
- Budget item notes collection: `src/lib/budget-item-notes-collection.ts`.
- Currency formatters: `src/lib/format.ts` (`formatCents`, `formatSoles`).

### External references

- `cmdk` — https://cmdk.paco.me/. The primitives we use: `Command.Dialog`, `Command.Input`, `Command.List`, `Command.Empty`, `Command.Item`. Override default filter with `shouldFilter={false}` to provide our own ranked items.

### Related

- The Cajita movement-notes plan: [docs/plans/2026-04-03-feat-movement-notes-plan.md](2026-04-03-feat-movement-notes-plan.md). Establishes that notes are 1:1 plain-text on each parent — the data shape this search depends on.
