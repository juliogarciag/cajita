---
title: "feat: 5-Year Balance Projection Chart"
type: feat
status: completed
date: 2026-04-05
origin: docs/brainstorms/2026-04-05-5-year-projection-brainstorm.md
---

# feat: 5-Year Balance Projection Chart

## Overview

Add a line chart to the Dashboard showing the projected month-by-month bank balance over the next 5 years (60 data points), driven by active recurring templates and current-year budgets.

The chart answers: *"If nothing changes, what does my balance look like at the end of year 1, 2, 3, 4, and 5?"*

All computation is client-side — no new server endpoints. All required data is already synced via ElectricSQL.

---

## Motivation

The app tracks past and future movements but has no long-range financial view. Spreadsheets typically have this as a manual projection table. This feature replaces that — and reacts automatically when templates or budgets change.

---

## Proposed Solution

### Architecture

Three new pieces:

1. **`src/lib/projection.ts`** — pure TypeScript function, no React deps
2. **`src/components/ProjectionChart.tsx`** — Recharts `<LineChart>` wrapper
3. **`src/routes/_authenticated/dashboard.tsx`** — updated to wire live queries + render chart

One new dependency: **`recharts`** (v3.8.1, React 19 compatible, TypeScript types bundled).

### Algorithm (`buildProjectionData`)

```
Input:
  startingBalanceCents  — see "Starting Balance" below
  templates             — RecurringMovementTemplate[] (all, filtering done inside)
  budgets               — Budget[] (all, filtering done inside)
  currentYear           — new Date().getFullYear()
  months = 60

For each month M in [nextMonth, nextMonth + 59]:
  1. For each active monthly template where instanceDate(M) is within [start_date, end_date]:
       runningBalance += template.amount_cents
  2. For each active annual template where M.month === template.month_of_year
       AND instanceDate(M) is within [start_date, end_date]:
       runningBalance += template.amount_cents
  3. runningBalance -= floor(currentYearBudgetsTotal / 12)
  4. Emit MonthDatum { month, label, balanceCents, isYearStart, yearLabel }

Output: MonthDatum[] (60 entries)
```

**`instanceDate(M, template)`** — for a given (year, month, template):
- Clamp `template.day_of_month` to the last day of that month (`clampDay`)
- Return `YYYY-MM-DD` ISO string
- Compare against `template.start_date` and `template.end_date` as ISO string (lexicographic ≥/≤)

**`clampDay(day, year, month)`** — replicate the server helper:
```ts
function clampDay(day: number, year: number, month: number): number {
  return Math.min(day, new Date(year, month, 0).getDate())
}
```

### Starting Balance

```
latestCheckpoint = checkpoints[0] (sorted by created_at desc)

if (latestCheckpoint):
  startingBalance = latestCheckpoint.actual_cents
                    + (currentLedgerBalance - latestCheckpoint.expected_cents)
else:
  startingBalance = currentLedgerBalance

currentLedgerBalance = movements
  .filter(m => m.date <= today && (m.confirmed !== false || m.source !== 'recurring'))
  .reduce((sum, m) => sum + m.amount_cents, 0)
```

This is identical to `currentBalance` in `MovementsTable.tsx` (lines 162–168). The checkpoint correction (`actual - expected`) captures the real-world drift between ledger and bank.

### Budget Filtering

Only use budgets where `year === currentYear`. This ensures:
- No double-counting with past `[Remaining]` movements (already in starting balance)
- No speculative future-year budgets
- The 2026 `[Remaining]` movement (dated 2026-12-31) is excluded from `currentLedgerBalance` and correctly replaced by the `÷12` monthly projection

The same annual amount is projected for all 60 months (assumption: budgets repeat year over year).

---

## Technical Considerations

### `projection.ts` — Key Types

```ts
// src/lib/projection.ts

export type MonthDatum = {
  month: string        // "2026-05-01" — XAxis dataKey
  label: string        // "May 2026"   — tooltip display
  balanceCents: number // running cumulative balance
  isYearStart: boolean // true for January of each year
  yearLabel: string    // "2027" for Jan 2027, "" otherwise
}

export function buildProjectionData(
  startingBalanceCents: number,
  templates: RecurringMovementTemplate[],
  budgets: Budget[],
  currentYear: number,
  months?: number,
): MonthDatum[]
```

### `ProjectionChart.tsx` — Recharts Setup

```tsx
// src/components/ProjectionChart.tsx
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'

export function ProjectionChart({ data }: { data: MonthDatum[] }) {
  const yearStartMonths = data
    .filter(d => d.isYearStart)
    .map(d => d.month)

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="4 4" />
        {yearStartMonths.map(m => (
          <ReferenceLine key={m} x={m} stroke="#f3f4f6" strokeWidth={1} />
        ))}
        <XAxis
          dataKey="month"
          ticks={yearStartMonths}
          tick={<YearTick data={data} />}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
          interval={0}
        />
        <YAxis
          tickFormatter={v => formatCents(v)}
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          width={80}
        />
        <Tooltip content={<ProjectionTooltip />} />
        <Line
          type="monotone"
          dataKey="balanceCents"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

Key choices:
- `isAnimationActive={false}` — prevents distracting re-animations on every ElectricSQL update
- `dot={false}` — performance with 60 data points; `activeDot` still shows on hover
- `ticks={yearStartMonths}` + custom tick component — renders only 5 year labels, no month clutter
- `ReferenceLine y={0}` — zero line always visible regardless of balance range
- `formatCents` from `#/lib/format.js` for Y-axis tick labels

### `dashboard.tsx` — Live Queries + Wiring

```tsx
// src/routes/_authenticated/dashboard.tsx
const { data: checkpoints } = useLiveQuery(q =>
  q.from({ c: checkpointsCollection }).orderBy(({ c }) => c.created_at, 'desc'),
)
const { data: movements } = useLiveQuery(q => q.from({ m: movementsCollection }))
const { data: templates } = useLiveQuery(q =>
  q.from({ t: recurringMovementTemplatesCollection }),
)
const { data: budgets } = useLiveQuery(q => q.from({ b: budgetsCollection }))

const currentLedgerBalance = useMemo(() => { /* same as MovementsTable */ }, [movements])
const startingBalance = useMemo(() => { /* checkpoint correction */ }, [checkpoints, currentLedgerBalance])
const projectionData = useMemo(() =>
  buildProjectionData(startingBalance, templates, budgets, new Date().getFullYear()),
  [startingBalance, templates, budgets],
)
```

---

## Edge Cases & Handling

| Edge case | Handling |
|---|---|
| No checkpoint | Fall back to `currentLedgerBalance` |
| No templates + no budgets | Flat horizontal line from starting balance; chart renders |
| Template with future `start_date` | `instanceDate < start_date` → skip that month |
| Template with `end_date` in past | All months skip; effectively invisible |
| Annual template: `month_of_year` before `start_date` in first year | Skip (instanceDate < start_date) |
| `day_of_month = 31` in February | `clampDay` → 28 or 29 |
| Negative balance reached | Line goes below zero; zero reference line makes it visible |
| `amount_cents = 0` template | Adds $0; no visible effect |
| Multiple checkpoints | Use `checkpoints[0]` (sorted by `created_at desc`) |
| Prior-year `[Remaining]` movements | Already in `currentLedgerBalance`; excluded by `year === currentYear` budget filter — no double-counting |
| Budget with `annual_amount_cents = 0` | Subtracts $0/month; safe |
| ElectricSQL not yet hydrated | `useLiveQuery` returns empty arrays → flat line from $0; acceptable for brief load flash |

---

## Acceptance Criteria

- [x] Dashboard renders a line chart card below the welcome message
- [x] Chart shows 60 monthly data points (next month through 60 months ahead)
- [x] X-axis displays only year labels (2027, 2028, 2029, 2030, 2031) at January boundaries
- [x] Y-axis displays USD-formatted balance values
- [x] Tooltip on hover shows month name ("May 2026") and formatted balance ("$12,400")
- [x] Horizontal dashed reference line at y=0
- [x] Vertical faint reference lines at each year boundary
- [x] Starting balance: `checkpoint.actual_cents + (ledgerBalance - checkpoint.expected_cents)`, falling back to `currentLedgerBalance` if no checkpoint
- [x] Only active recurring templates contribute to projection
- [x] Annual templates fire only in their `month_of_year` month
- [x] Templates respect `start_date` and `end_date` (no contribution outside range)
- [x] Only current-year budgets contribute (filter: `budget.year === currentYear`)
- [x] Budgets distributed evenly: `annual_amount_cents / 12` per projected month
- [x] Chart reacts automatically when templates or budgets change (reactive via live queries)
- [x] Chart is responsive (fills dashboard card width)
- [x] No animation on data updates (prevents flicker on reactive changes)
- [x] `buildProjectionData` is a pure function in `src/lib/projection.ts`, no React deps

---

## System-Wide Impact

- **No server changes** — read-only client computation
- **No DB schema changes** — uses existing collections
- **No new ElectricSQL shapes** — reuses existing subscriptions from existing collections
- **New npm dependency** — `recharts` adds ~70–80 KB gzipped to the bundle (with tree-shaking of unused chart types)
- **Dashboard route** — currently a stub; this is the first real content. Future dashboard additions should follow the `useLiveQuery` + `useMemo` pattern established here
- **`src/lib/projection.ts`** — shared pure function; could be reused by future "what-if" scenarios or export features

---

## Dependencies & Risks

| Item | Notes |
|---|---|
| `recharts` v3.8.1 | React 19 compatible; types bundled; ~70–80 KB gzipped tree-shaken |
| No `clampDay` export from server | `recurring-movements.ts` defines `clampDay` as a private function; must be re-implemented in `projection.ts` (trivial 3-liner) |
| `recurringMovementTemplatesCollection` | All fields needed are already in the Zod schema and synced |
| `checkpointsCollection` | `actual_cents` + `expected_cents` both synced |
| `movementsCollection` | Full collection needed for `currentLedgerBalance` — this is a large shape; already loaded by MovementsTable on the finances route, but dashboard loads it fresh |

---

## Implementation Steps

1. `npm install recharts` — add dependency
2. Create `src/lib/projection.ts` with `buildProjectionData` and `MonthDatum` type
3. Create `src/components/ProjectionChart.tsx` with Recharts line chart
4. Update `src/routes/_authenticated/dashboard.tsx` to add live queries, compute projection, render chart

---

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-04-05-5-year-projection-brainstorm.md](../brainstorms/2026-04-05-5-year-projection-brainstorm.md)
  - Key decisions carried forward: client-side computation only, Recharts library, starting from latest checkpoint balance, budgets spread ÷12/month, monthly granularity

### Internal References

- Recurring template generation logic: `src/server/recurring-movements.ts` — `generateRecurringMovements`, `clampDay`
- `currentBalance` computation pattern: `src/components/MovementsTable.tsx:162–168`
- `useLiveQuery` patterns: `src/components/MovementsTable.tsx:56–69`, `src/components/BudgetDetail.tsx:42–71`
- `formatCents` utility: `src/lib/format.ts`
- Dashboard stub: `src/routes/_authenticated/dashboard.tsx`
- Checkpoints collection: `src/lib/checkpoints-collection.ts`
- Budgets collection: `src/lib/budgets-collection.ts`
- Recurring templates collection: `src/lib/recurring-movement-templates-collection.ts`

### External References

- [Recharts LineChart docs](https://recharts.github.io/en-US/api/LineChart)
- [Recharts ReferenceLine docs](https://recharts.github.io/en-US/api/ReferenceLine)
- [Recharts v3 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide)
- [Recharts TypeScript guide](https://recharts.github.io/en-US/guide/typescript)
