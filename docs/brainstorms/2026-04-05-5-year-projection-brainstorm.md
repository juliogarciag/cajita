# 5-Year Financial Projection

**Date:** 2026-04-05
**Status:** Draft

---

## What We're Building

A line chart on the Dashboard showing how the user's bank balance is projected to evolve month by month over the next 5 years (60 data points), assuming recurring templates and annual budgets stay the same.

The chart answers: *"If nothing changes, what does my balance look like at the end of year 1, 2, 3, 4, and 5?"*

---

## Context

The app already has all the raw ingredients:
- **Recurring templates** (monthly & annual) — already synced client-side via ElectricSQL
- **Budgets** — annual spending envelopes with `annual_amount_cents`, already synced
- **Checkpoints** — the most recent checkpoint's `actual_cents` is the reconciled real-world starting balance

What's missing: a visualization layer that projects these forward beyond the current ~15-month recurring generation window.

---

## Chosen Approach: Client-Side Projection + Recharts

All required data is already available in client-side collections. The projection is computed in React — no new server endpoints needed.

**Algorithm (per month, 60 iterations):**
1. Start: `latestCheckpoint.actual_cents`
2. For each month M from now to 5 years out:
   - **Add** each active recurring template that fires in M (monthly templates always; annual templates only in their `month_of_year`)
   - **Subtract** `annual_amount_cents / 12` for each budget that exists in year(M)
3. Plot cumulative running balance

**Chart:** A single line chart (Recharts `<LineChart>`) with:
- X-axis: months (labeled at year boundaries: 2027, 2028, 2029, 2030, 2031)
- Y-axis: balance in USD
- Vertical dashed markers at each year-end
- Tooltip showing exact month + projected balance
- Zero line for reference (so negative balance is visually obvious)

**Why Recharts:** No charting library exists in the project. Recharts is the standard React-native option — composable, well-maintained, and getting a line chart working is straightforward.

---

## Why This Approach

- **Zero new server endpoints** — all data is already client-side
- **Reactive** — the chart updates automatically when templates or budgets change (TanStack DB live queries)
- **Consistent with existing patterns** — uses the same `useLiveQuery` pattern used everywhere
- **Budget distribution** — monthly slicing (÷12) gives a smoother, more realistic curve than the EOY-lump model the `[Remaining]` movement uses in the ledger

### Alternatives Considered

| Approach | Why Rejected |
|---|---|
| Server-side endpoint | Same data sources, more complexity, no accuracy gain |
| Extend recurring movement generator to 5 years | Would pollute the ledger with thousands of unconfirmed rows |
| Hand-rolled SVG | Would take longer to get right; Recharts handles responsiveness, tooltips, axes |

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data sources | Recurring templates + annual budgets | User confirmed both; captures "regular things" |
| Starting balance | Latest checkpoint `actual_cents` | Reconciled against real bank — more trustworthy than ledger sum |
| Budget spread | Evenly across 12 months (÷12) | Smoother curve; more realistic than EOY lump |
| Placement | Dashboard | User's choice; visible at a glance |
| Granularity | Monthly (60 data points) | Enough resolution to see trends; not overwhelming |
| Chart library | Recharts | Standard React charting library; zero existing charts to be consistent with |

---

## Scope (MVP)

- Line chart on Dashboard
- 60 monthly data points (5 years)
- Start from latest checkpoint balance (fall back to confirmed ledger balance if no checkpoint)
- Recurring templates: project monthly and annual templates indefinitely (no generation horizon limit for this view)
- Budgets: repeat each year's `annual_amount_cents ÷ 12` per month (use current year's budgets as the repeating baseline)
- Year markers on X-axis
- Responsive width (fills dashboard card)

## Out of Scope (for now)

- "What-if" scenario editing (adjusting amounts)
- Multiple currencies / Soles projection
- Category breakdown by color
- Confidence intervals or ranges
- Saving/comparing multiple scenarios

---

## Open Questions

_None — all key decisions resolved._

---

## Resolved Questions

- **What data drives the projection?** → Recurring templates + annual budgets
- **Output format?** → Running balance line chart (monthly granularity)
- **Placement?** → Dashboard
- **Starting balance?** → Latest checkpoint `actual_cents`
- **Budget distribution?** → Evenly across 12 months (÷12)
