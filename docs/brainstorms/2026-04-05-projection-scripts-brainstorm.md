# Projection Scripts — What-If Scenarios

**Date:** 2026-04-05
**Status:** Draft

---

## What We're Building

A system for defining named "what-if" financial scenarios that appear as additional lines overlaid on the existing dashboard projection chart.

Each scenario is powered by a **script** — a TypeScript file authored by the developer that declares a typed set of inputs and implements the logic to turn those inputs into projection adjustments. Users don't write scripts; they fill in a form generated from the script's declared inputs, give the scenario a name, and save it. Scenarios are persisted to the DB and load automatically on every visit.

The chart answers: *"Here's the base projection — and here's what changes if [scenario]."*

---

## Context

The base 5-year projection chart shipped on 2026-04-05. "Saving/comparing multiple scenarios" was explicitly out of scope for that MVP. This feature is the natural next step.

The core projection engine (`buildProjectionData`) is already a pure function. Scenarios just need to produce a modified version of its inputs — the same function runs for each line.

---

## Chosen Approach

### Script Definition (Developer-authored)

Scripts live in `src/lib/projection-scripts/` and are registered explicitly in an `index.ts` file. Each script uses a `defineScript()` helper to declare:

- `id` — stable string identifier (survives renames; matched against DB records)
- `name` — human-readable label shown in the UI
- `inputs` — typed input declarations (see below)
- `run(inputs, context)` — pure function returning an array of `Adjustment[]`

```ts
// src/lib/projection-scripts/mortgage-payoff.ts
export const mortgagePayoffScript = defineScript({
  id: 'mortgage-payoff',
  name: 'Mortgage payoff',
  inputs: {
    mortgage: templateInput({ label: 'Mortgage template' }),
    payoffDate: dateInput({ label: 'Target payoff date' }),
    extraMonthly: amountInput({ label: 'Extra monthly payment', optional: true }),
  },
  run({ mortgage, payoffDate, extraMonthly }) {
    return [
      { type: 'end-template', templateId: mortgage.id, at: payoffDate },
      ...(extraMonthly ? [{
        type: 'add-template',
        template: { description: 'Extra mortgage payment', amount_cents: -extraMonthly,
                    period_type: 'monthly', start_date: TODAY, end_date: payoffDate }
      }] : []),
    ]
  }
})
```

```ts
// src/lib/projection-scripts/index.ts
export const SCRIPTS = [mortgagePayoffScript, salaryChangeScript, /* ... */]
```

### Input Types (MVP set)

| Type | UI Component | Value stored in DB |
|---|---|---|
| `templateInput` | Searchable dropdown of user's recurring templates | `{ templateId: string }` |
| `dateInput` | Date picker | `string` (YYYY-MM-DD) |
| `amountInput` | Currency input (cents) | `number` |

Future: `percentageInput` (for inflation multipliers), `budgetInput`.

### Adjustment Types

What a script's `run()` function can return:

| Type | Effect |
|---|---|
| `one-time` | Inject a single entry at a specific date (e.g. lump-sum payoff) |
| `end-template` | Override a template's `end_date` in the projection |
| `add-template` | Inject a synthetic recurring template (doesn't touch real data) |
| `change-template` | Override a template's `amount_cents` from a given date forward |

These are applied to the template/budget arrays before calling `buildProjectionData`, keeping the engine unchanged.

### Persistence

A new team-scoped DB table `projection_scenarios`:

```
id            uuid PK
team_id       text FK
name          text         -- user-given name ("Pay off mortgage by 2031")
script_id     text         -- matches SCRIPTS[i].id in code
inputs_json   jsonb        -- bound input values keyed by input name
active        boolean      -- whether this scenario appears on the chart
created_at    timestamp
updated_at    timestamp
```

The `inputs_json` stores raw values (template IDs, dates, amounts). At render time, template IDs are resolved against the live `recurringMovementTemplatesCollection`. If a referenced template no longer exists, the scenario shows an error state.

### Dashboard UI

The dashboard gets two additions:

1. **Chart**: the existing `ProjectionChart` renders the base line (blue) + one line per active, valid scenario (each a different color from a fixed palette). A legend identifies each line.

2. **Scenarios list** below the chart: a compact card per saved scenario showing name, script name, active toggle, and edit/delete actions. Broken scenarios (unresolved template reference) show a warning instead of their inputs.

3. **"Add scenario" button** → modal with a script selector → script-specific input form (generated from `inputs`) → name field → Save.

### Error Handling

If `inputs_json` references a template ID that no longer exists in the collection, the scenario card renders: *"⚠️ 'Mortgage template' not found — please re-select."* The scenario is excluded from the chart. No crash.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Script persistence | Team-scoped DB table | First-class entity; loads automatically; survives deploys |
| Script discovery | Explicit registry in `index.ts` | No magic; TypeScript enforces correctness; obvious to read |
| Placement | Extend dashboard | Base + what-ifs visually compared in one place |
| Error handling | Warning card state | User knows exactly what's broken and can fix it; no silent failures |
| Script authoring | Developer-only (code) | User is the developer; no need for a script editor UI |
| Template binding | By ID (UUID), bound in UI | Stable across renames; user explicitly picks their template |
| Adjustment application | Pre-process inputs before `buildProjectionData` | Engine stays unchanged; clean separation |

---

## Scope (MVP)

- `defineScript` + `defineInput` helpers in `src/lib/projection-scripts/`
- `Adjustment` type and application logic (extends `buildProjectionData` or wraps it)
- `projection_scenarios` DB table + migration
- ElectricSQL collection + server functions (CRUD)
- Dashboard chart: multiple lines with legend
- Dashboard UI: scenario list + add/edit/delete modal
- Error state for broken template bindings
- Ship with 1-2 built-in scripts: `mortgage-payoff`, `salary-change`

## Out of Scope

- User-written script code in the UI
- Percentage/inflation input type (future)
- Budget inputs (future)
- Scenario export or sharing
- Scenario versioning or history

---

## Open Questions

_None — all key decisions resolved._

---

## Resolved Questions

- **Persist to DB?** → Yes, team-scoped table
- **Placement?** → Dashboard (overlay lines on existing chart)
- **Script discovery?** → Explicit registry in `index.ts`
- **Broken input handling?** → Warning card state, scenario excluded from chart
