import type { RecurringMovementTemplate } from '#/lib/recurring-movement-templates-collection.js'
import type { Adjustment, SyntheticTemplate } from './types.js'

/**
 * Apply a list of adjustments to a template array, returning a new modified array.
 * Pure function — the original array is never mutated.
 *
 * Adjustment semantics:
 * - end-template:    set end_date on a matching template (clipped to `at`)
 * - add-template:    inject a synthetic template (new entry, no real DB record)
 * - change-template: override amount_cents from a given date by splitting the template
 * - one-time:        not applied here — handled separately in buildProjectionData callers
 */
export function applyAdjustments(
  templates: RecurringMovementTemplate[],
  adjustments: Adjustment[],
): RecurringMovementTemplate[] {
  // Work on a shallow copy so we can freely mutate the mapped results
  let result: RecurringMovementTemplate[] = templates.map((t) => ({ ...t }))

  for (const adj of adjustments) {
    if (adj.type === 'end-template') {
      result = result.map((t) => {
        if (t.id !== adj.templateId) return t
        // Only tighten the end_date, never extend it
        const newEndDate = t.end_date === null || adj.at < t.end_date ? adj.at : t.end_date
        return { ...t, end_date: newEndDate }
      })
    } else if (adj.type === 'change-template') {
      result = result.map((t) => {
        if (t.id !== adj.templateId) return t
        // Cap the original template at the day before the change takes effect
        const oneDayBefore = subtractOneDay(adj.from)
        const cappedOriginal: RecurringMovementTemplate = {
          ...t,
          end_date: t.end_date !== null && t.end_date < oneDayBefore ? t.end_date : oneDayBefore,
        }
        // Synthetic continuation with the new amount
        const continuation: RecurringMovementTemplate = {
          ...t,
          id: `${t.id}__changed`,
          amount_cents: adj.amount_cents,
          start_date: adj.from,
        }
        return [cappedOriginal, continuation] as unknown as RecurringMovementTemplate
      })
      // Flatten — the map above may have returned arrays for changed templates
      result = result.flat() as RecurringMovementTemplate[]
    } else if (adj.type === 'add-template') {
      result.push(syntheticToTemplate(adj.template))
    }
    // 'one-time' adjustments are not applied here
  }

  return result
}

/**
 * Extract only the one-time adjustments from an adjustment list.
 * These need to be handled by the caller when iterating month data.
 */
export function getOneTimeAdjustments(
  adjustments: Adjustment[],
): Array<{ date: string; amount_cents: number; description: string }> {
  return adjustments
    .filter((a) => a.type === 'one-time')
    .map((a) => {
      if (a.type !== 'one-time') throw new Error('unreachable')
      return { date: a.date, amount_cents: a.amount_cents, description: a.description }
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function subtractOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

let _syntheticCounter = 0

function syntheticToTemplate(t: SyntheticTemplate): RecurringMovementTemplate {
  return {
    id: `__synthetic__${++_syntheticCounter}`,
    team_id: '__synthetic__',
    description: t.description,
    amount_cents: t.amount_cents,
    category_id: null,
    period_type: t.period_type,
    day_of_month: t.day_of_month ?? 1,
    month_of_year: t.month_of_year ?? null,
    start_date: t.start_date,
    end_date: t.end_date,
    active: true,
    created_at: '',
    updated_at: '',
  }
}
