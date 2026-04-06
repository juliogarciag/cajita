// ---------------------------------------------------------------------------
// Input definitions — declared by the developer per script
// ---------------------------------------------------------------------------

export type TemplateInputDef = { kind: 'template'; label: string; optional?: boolean }
export type DateInputDef = { kind: 'date'; label: string; optional?: boolean }
export type AmountInputDef = { kind: 'amount'; label: string; optional?: boolean }

export type InputDef = TemplateInputDef | DateInputDef | AmountInputDef

// ---------------------------------------------------------------------------
// Input values — what gets stored in inputs_json and passed to run()
// ---------------------------------------------------------------------------

export type TemplateInputValue = { templateId: string }
export type DateInputValue = string // YYYY-MM-DD
export type AmountInputValue = number // cents

/** Resolve the runtime value type for a given InputDef */
type ResolveValue<T extends InputDef> = T extends TemplateInputDef
  ? T extends { optional: true }
    ? TemplateInputValue | undefined
    : TemplateInputValue
  : T extends DateInputDef
    ? T extends { optional: true }
      ? DateInputValue | undefined
      : DateInputValue
    : T extends AmountInputDef
      ? T extends { optional: true }
        ? AmountInputValue | undefined
        : AmountInputValue
      : never

export type InputValues<T extends Record<string, InputDef>> = {
  [K in keyof T]: ResolveValue<T[K]>
}

// ---------------------------------------------------------------------------
// Adjustments — what run() returns
// ---------------------------------------------------------------------------

/** A synthetic recurring template that doesn't exist in the real data */
export type SyntheticTemplate = {
  description: string
  amount_cents: number
  period_type: 'monthly' | 'annual'
  start_date: string // YYYY-MM-DD
  end_date: string | null
  day_of_month?: number // defaults to 1
  month_of_year?: number // required if period_type === 'annual'
}

export type Adjustment =
  /** Inject a single entry at a specific date */
  | { type: 'one-time'; date: string; amount_cents: number; description: string }
  /** Override a template's end_date in the projection */
  | { type: 'end-template'; templateId: string; at: string }
  /** Inject a synthetic recurring template (doesn't touch real data) */
  | { type: 'add-template'; template: SyntheticTemplate }
  /** Override a template's amount_cents from a given date forward */
  | { type: 'change-template'; templateId: string; from: string; amount_cents: number }

// ---------------------------------------------------------------------------
// Script context passed to run()
// ---------------------------------------------------------------------------

export type ScriptContext = {
  /** Today's date as YYYY-MM-DD, for convenience */
  today: string
}

// ---------------------------------------------------------------------------
// Script definition
// ---------------------------------------------------------------------------

export type ScriptDef<T extends Record<string, InputDef> = Record<string, InputDef>> = {
  id: string
  name: string
  inputs: T
  run(values: InputValues<T>, context: ScriptContext): Adjustment[]
}

/** Helper that returns the script definition with full type inference */
export function defineScript<T extends Record<string, InputDef>>(def: ScriptDef<T>): ScriptDef<T> {
  return def
}

// ---------------------------------------------------------------------------
// Input factory helpers
// ---------------------------------------------------------------------------

export const templateInput = (opts: { label: string; optional?: boolean }): TemplateInputDef => ({
  kind: 'template',
  ...opts,
})

export const dateInput = (opts: { label: string; optional?: boolean }): DateInputDef => ({
  kind: 'date',
  ...opts,
})

export const amountInput = (opts: { label: string; optional?: boolean }): AmountInputDef => ({
  kind: 'amount',
  ...opts,
})
