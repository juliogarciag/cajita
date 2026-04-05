---
title: "feat: Projection Scripts — What-If Scenario Overlays"
type: feat
status: completed
date: 2026-04-05
origin: docs/brainstorms/2026-04-05-projection-scripts-brainstorm.md
---

# feat: Projection Scripts — What-If Scenario Overlays

## Overview

Add a "what-if" scenario system to the Dashboard projection chart. Scenarios are powered by **developer-authored TypeScript scripts** that declare typed inputs and return a set of projection adjustments. Users fill in the declared inputs through a generated UI form, name the scenario, and save it. Each saved scenario renders as an additional line overlaid on the base projection chart.

The chart answers: *"Here's the base projection — and here's what changes if [scenario]."*

---

## Problem Statement / Motivation

The 5-year projection chart (shipped 2026-04-05) shows one fixed line: "what happens if nothing changes." The natural next question is *"what if something does change?"* — paying off the mortgage early, a salary increase, a large one-time purchase. Currently users must mentally simulate these scenarios or maintain manual spreadsheets alongside the app.

The key insight from brainstorming (see brainstorm: `docs/brainstorms/2026-04-05-projection-scripts-brainstorm.md`): **script logic is code, script parameters are user data.** The developer writes the logic once in TypeScript; the user configures it via a generated form. This gives type-safe, domain-specific calculation power without requiring users to write code.

---

## Proposed Solution

### Architecture Overview

```
src/lib/projection-scripts/
  types.ts           — Adjustment union, InputDef types, defineScript helper
  apply.ts           — applyAdjustments(templates, budgets, adjustments) → modified inputs
  index.ts           — SCRIPTS registry
  mortgage-payoff.ts — Built-in script

src/lib/projection-scenarios-collection.ts  — ElectricSQL collection
src/server/projection-scenarios.ts          — Server functions (CRUD)
src/db/migrations/018_projection_scenarios.ts

src/components/ProjectionChart.tsx          — Updated: multi-line + legend
src/components/ScenariosPanel.tsx           — Scenario list + add/edit modal
src/routes/_authenticated/dashboard.tsx    — Wires scenarios into chart
```

### Script Definition (Developer-Authored)

```ts
// src/lib/projection-scripts/types.ts
export type TemplateInputValue = { templateId: string }
export type DateInputValue = string          // YYYY-MM-DD
export type AmountInputValue = number        // cents

export type InputDef =
  | { kind: 'template'; label: string; optional?: boolean }
  | { kind: 'date';     label: string; optional?: boolean }
  | { kind: 'amount';   label: string; optional?: boolean }

export type InputValues<T extends Record<string, InputDef>> = {
  [K in keyof T]:
    T[K] extends { kind: 'template' } ? TemplateInputValue :
    T[K] extends { kind: 'date' }     ? DateInputValue :
    T[K] extends { kind: 'amount' }   ? AmountInputValue :
    never
}

export type Adjustment =
  | { type: 'one-time';        date: string; amount_cents: number; description: string }
  | { type: 'end-template';    templateId: string; at: string }
  | { type: 'add-template';    template: SyntheticTemplate }
  | { type: 'change-template'; templateId: string; from: string; amount_cents: number }

export type SyntheticTemplate = {
  description: string
  amount_cents: number
  period_type: 'monthly' | 'annual'
  start_date: string
  end_date: string | null
  day_of_month?: number      // defaults to 1
  month_of_year?: number     // required if period_type === 'annual'
}

export type ScriptDef<T extends Record<string, InputDef>> = {
  id: string
  name: string
  inputs: T
  run(values: InputValues<T>, context: ScriptContext): Adjustment[]
}

export type ScriptContext = {
  today: string   // YYYY-MM-DD, for convenience
}

export function defineScript<T extends Record<string, InputDef>>(def: ScriptDef<T>): ScriptDef<T> {
  return def
}

// Input factory helpers
export const templateInput = (opts: { label: string; optional?: boolean }) =>
  ({ kind: 'template' as const, ...opts })
export const dateInput = (opts: { label: string; optional?: boolean }) =>
  ({ kind: 'date' as const, ...opts })
export const amountInput = (opts: { label: string; optional?: boolean }) =>
  ({ kind: 'amount' as const, ...opts })
```

### Adjustment Application

```ts
// src/lib/projection-scripts/apply.ts
export function applyAdjustments(
  templates: RecurringMovementTemplate[],
  adjustments: Adjustment[],
): RecurringMovementTemplate[]
```

This is a **pure function** that takes the template array and returns a modified copy — it does **not** mutate. The modified array is then passed to `buildProjectionData` alongside the original budgets. Keeps the engine unchanged (see brainstorm: chosen approach — "pre-process inputs before `buildProjectionData`").

### Built-In Scripts

**`mortgage-payoff.ts`**:
```ts
export const mortgagePayoffScript = defineScript({
  id: 'mortgage-payoff',
  name: 'Mortgage payoff',
  inputs: {
    mortgage: templateInput({ label: 'Mortgage template' }),
    payoffDate: dateInput({ label: 'Target payoff date' }),
    extraMonthly: amountInput({ label: 'Extra monthly payment', optional: true }),
  },
  run({ mortgage, payoffDate, extraMonthly }, { today }) {
    return [
      { type: 'end-template', templateId: mortgage.templateId, at: payoffDate },
      ...(extraMonthly != null ? [{
        type: 'add-template' as const,
        template: {
          description: 'Extra mortgage payment',
          amount_cents: -Math.abs(extraMonthly),
          period_type: 'monthly' as const,
          start_date: today,
          end_date: payoffDate,
        }
      }] : []),
    ]
  }
})
```

### Persistence

#### Migration 018

```ts
// src/db/migrations/018_projection_scenarios.ts
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('projection_scenarios')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('team_id', 'text', col => col.notNull().references('teams.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('script_id', 'text', col => col.notNull())
    .addColumn('inputs_json', 'jsonb', col => col.notNull())
    .addColumn('active', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`CREATE UNIQUE INDEX projection_scenarios_team_name_unique
    ON projection_scenarios (team_id, name)`.execute(db)

  await sql`CREATE INDEX projection_scenarios_team_id_idx
    ON projection_scenarios (team_id)`.execute(db)
}
```

#### Kysely Schema

```ts
// src/db/schema.ts addition
projection_scenarios: {
  id: Generated<string>
  team_id: string
  name: string
  script_id: string
  inputs_json: string   // jsonb serialized by pg driver as string
  active: Generated<boolean>
  created_at: Generated<string>
  updated_at: Generated<string>
}
```

#### Electric Endpoint

Add `'projection_scenarios'` to both `ALLOWED_TABLES` and `TEAM_SCOPED_TABLES` in `src/routes/api/electric/$table.ts`.

#### ElectricSQL Collection

```ts
// src/lib/projection-scenarios-collection.ts
const projectionScenarioSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  name: z.string(),
  script_id: z.string(),
  inputs_json: z.string(),   // raw JSON string from pg
  active: z.coerce.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ProjectionScenario = z.infer<typeof projectionScenarioSchema>

export const projectionScenariosCollection = createCollection(
  electricCollectionOptions({ ... })
)
```

#### Server Functions (CRUD)

```ts
// src/server/projection-scenarios.ts
createScenario(teamId, { name, scriptId, inputsJson, active })
updateScenario(teamId, id, patch)
deleteScenario(teamId, id)
toggleScenarioActive(teamId, id, active)
```

Standard `createServerFn()` pattern matching existing server functions. All operations validate `teamId` ownership before mutating.

---

## Technical Approach

### Phase 1: DB Foundation

1. Write `src/db/migrations/018_projection_scenarios.ts`
2. Update `src/db/schema.ts` with `projection_scenarios` table type
3. Add `projection_scenarios` to `ALLOWED_TABLES` + `TEAM_SCOPED_TABLES` in `$table.ts`
4. Create `src/lib/projection-scenarios-collection.ts`
5. Create `src/server/projection-scenarios.ts` with CRUD server functions

### Phase 2: Script Engine

1. Create `src/lib/projection-scripts/types.ts` — all types + `defineScript` + input helpers
2. Create `src/lib/projection-scripts/apply.ts` — `applyAdjustments` pure function
3. Create `src/lib/projection-scripts/mortgage-payoff.ts`
4. Create `src/lib/projection-scripts/index.ts` — `export const SCRIPTS = [mortgagePayoffScript]`

### Phase 3: Dashboard UI

1. Update `src/components/ProjectionChart.tsx`:
   - Accept `scenarios: Array<{ name: string; data: MonthDatum[]; color: string }>` prop
   - Render one `<Line>` per scenario with its color + the base line in blue
   - Add legend below chart (colored dot + scenario name per line)
   - Update tooltip to show all active lines at hovered month

2. Create `src/components/ScenariosPanel.tsx`:
   - List of scenario cards (name, script name, active toggle, edit/delete actions)
   - Broken scenario state: `⚠️ '[Input label]' not found — please re-select`
   - "Add scenario" button → modal (script selector → generated input form → name field → Save)
   - Edit modal: pre-fills current values

3. Update `src/routes/_authenticated/dashboard.tsx`:
   - Add `useLiveQuery` for `projectionScenariosCollection`
   - Compute scenario projection data per active, valid scenario
   - Pass scenario data + colors to `ProjectionChart`
   - Render `ScenariosPanel` below chart

---

## Alternative Approaches Considered

| Approach | Rejected Because |
|---|---|
| Match templates by name string | Fragile across renames — UUID binding via UI is stable (see brainstorm) |
| User-editable script code in UI | Unnecessary complexity; developer is the user |
| Apply adjustments inside `buildProjectionData` | Would modify the engine; adjustment pre-processing keeps engine unchanged |
| Scenario-scoped `buildProjectionData` fork | Too much code duplication; adjustments as pre-processing is cleaner |

---

## System-Wide Impact

### Interaction Graph

1. User saves a scenario → `createScenario` server function → INSERT into `projection_scenarios` → ElectricSQL propagates change → `projectionScenariosCollection` updates → `useLiveQuery` triggers → `DashboardPage` re-renders → new scenario line appears on chart.

2. User modifies a referenced template → `recurringMovementTemplatesCollection` updates → `DashboardPage` `useMemo` for each scenario recomputes → if template ID still exists, line re-calculates; if template was deleted, scenario enters error state.

### Error & Failure Propagation

- **Missing template reference**: Detected at render time by checking `templateId` in `inputs_json` against `recurringMovementTemplatesCollection`. Scenario excluded from chart; error card shown. No crash.
- **Unknown script_id**: Script not found in `SCRIPTS` registry (e.g. stale DB record from a removed script). Scenario card shows: *"⚠️ Script '[id]' no longer exists."* Excluded from chart.
- **inputs_json schema drift**: Script's `InputDef` declarations changed in code but DB has old JSON. Validate `inputs_json` against script's declared input schema using Zod before calling `run()`. On failure: show error card with *"⚠️ Inputs need updating — please re-save."*
- **`run()` throws**: Wrap in try/catch. Log error, show error card. Never propagate to chart render.

### State Lifecycle Risks

- Scenario names are unique per team (DB constraint). Attempting to save a duplicate name surfaces a DB error that the server function should catch and return as a user-facing message.
- `inputs_json` is written once at save time and never auto-migrated. If script inputs change in a deploy, existing scenarios will fail Zod validation gracefully until the user re-saves.
- No orphaned records: `team_id` FK with `ON DELETE CASCADE` ensures scenarios are cleaned up if a team is deleted.

### API Surface Parity

No existing interfaces expose equivalent functionality — this is net-new.

### Integration Test Scenarios

1. Create scenario → verify line appears on chart with correct color and data
2. Toggle scenario inactive → verify line disappears from chart but card remains
3. Delete a referenced template → verify scenario enters error card state, chart excludes it
4. Save scenario with duplicate name → verify user-facing error (not a crash)
5. Remove a script from `SCRIPTS` registry → verify existing DB scenario shows "script no longer exists" error card

---

## Acceptance Criteria

### Functional

- [x] Developer can define a script in `src/lib/projection-scripts/` and register it in `index.ts`; it appears in the "Add scenario" script selector
- [x] `defineScript()` accepts `id`, `name`, `inputs` (typed), and `run()` returning `Adjustment[]`
- [x] Three adjustment types work correctly: `end-template`, `add-template`, `change-template`
- [x] `applyAdjustments` is a pure function; original template array is not mutated
- [x] Saved scenarios persist across page refreshes (DB-backed, ElectricSQL synced)
- [x] Active scenarios render as additional lines on the projection chart
- [x] Base line always renders in blue; scenario lines use colors from a fixed palette (5+ colors)
- [x] Chart legend identifies each line by name
- [x] Tooltip on hover shows all line values for the hovered month
- [x] Inactive scenarios (toggled off) are excluded from chart but remain in the list
- [x] Scenario with deleted template reference shows warning card and is excluded from chart
- [x] Scenario with unknown script_id shows warning card and is excluded from chart
- [x] `inputs_json` validated against script's input schema before calling `run()`; drift shows warning card
- [x] "Add scenario" modal: script selector → generated form → name field → Save
- [x] "Edit scenario" modal: pre-filled form; Save updates record
- [x] Delete scenario: confirmation prompt → removes from DB and chart
- [x] Unique name constraint enforced; duplicate name shows user-facing error in modal
- [x] `mortgage-payoff` built-in script ships and works end-to-end

### Non-Functional

- [x] `applyAdjustments` and script `run()` are pure functions with no side effects
- [x] No animation on scenario line updates (matches existing `isAnimationActive={false}`)
- [x] Chart remains responsive (fills card width) with multiple lines
- [x] Broken scenarios never cause a JS exception that affects the rest of the dashboard

---

## Dependencies & Risks

| Item | Notes |
|---|---|
| Migration 018 | Straightforward — new table, no schema changes to existing tables |
| ElectricSQL jsonb handling | The pg driver returns jsonb columns as strings; parse with `JSON.parse()` at render time |
| Recharts multi-line | Already using Recharts v3; adding more `<Line>` components is supported — tested up to ~10 lines |
| Color palette | Fixed array of 5 colors (e.g. `#10b981, #f59e0b, #ef4444, #8b5cf6, #f97316`); if user creates more than 5 scenarios, colors cycle. Documented as known limit. |
| Conflict between adjustments | Two scenarios modifying the same template: each scenario runs independently; no cross-scenario conflict possible (each gets its own copy of the template array) |

---

## Implementation Steps

1. **Migration** — `src/db/migrations/018_projection_scenarios.ts` (up + down)
2. **Schema** — add `projection_scenarios` to `src/db/schema.ts`
3. **Electric endpoint** — add `projection_scenarios` to `ALLOWED_TABLES` + `TEAM_SCOPED_TABLES`
4. **Collection** — `src/lib/projection-scenarios-collection.ts`
5. **Server functions** — `src/server/projection-scenarios.ts` (create, update, delete, toggle)
6. **Script types** — `src/lib/projection-scripts/types.ts`
7. **Apply function** — `src/lib/projection-scripts/apply.ts`
8. **Built-in script** — `mortgage-payoff.ts`
9. **Script registry** — `src/lib/projection-scripts/index.ts`
10. **ProjectionChart** — update to accept + render scenario lines with legend
11. **ScenariosPanel** — scenario list, error states, add/edit/delete modal
12. **dashboard.tsx** — wire up scenarios collection + render ScenariosPanel

---

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-04-05-projection-scripts-brainstorm.md](../brainstorms/2026-04-05-projection-scripts-brainstorm.md)
  - Key decisions carried forward: persist to DB (team-scoped table), explicit script registry in `index.ts`, apply adjustments pre-`buildProjectionData`, warning card state for broken scenarios, template binding by UUID via UI

### Internal References

- Base projection engine: `src/lib/projection.ts` — `buildProjectionData` pure function
- Chart component: `src/components/ProjectionChart.tsx` — to be extended for multi-line
- Dashboard route: `src/routes/_authenticated/dashboard.tsx` — wiring point
- Electric endpoint (tables whitelist): `src/routes/api/electric/$table.ts:7-24`
- Recurring templates collection (pattern to follow): `src/lib/recurring-movement-templates-collection.ts`
- Latest migration (017): `src/db/migrations/017_recurring_templates_annual.ts`
- Existing server function pattern: `src/server/` — any existing CRUD file

### External References

- [Recharts LineChart docs](https://recharts.github.io/en-US/api/LineChart) — adding multiple `<Line>` components
- [Recharts Legend docs](https://recharts.github.io/en-US/api/Legend)
- [Kysely migrations](https://kysely.dev/docs/migrations)
