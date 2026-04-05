import type { RecurringMovementTemplate } from '#/lib/recurring-movement-templates-collection.js'
import type { Budget } from '#/lib/budgets-collection.js'

export type MonthDatum = {
  /** "2026-05-01" — first of month, used as XAxis dataKey */
  month: string
  /** "May 2026" — shown in tooltip */
  label: string
  /** Cumulative running balance in cents */
  balanceCents: number
  /** True for January of each year (year boundary tick) */
  isYearStart: boolean
  /** "2027" for Jan 2027, "" otherwise */
  yearLabel: string
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Number of days in a given month (1-indexed month) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Clamp day_of_month to the last valid day of the given month */
function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month))
}

/** Format (year, month, day) as YYYY-MM-DD */
function toISO(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * Build 60 monthly projection data points starting from next month.
 *
 * Data sources:
 * - Active recurring templates (monthly + annual) projected indefinitely
 * - Current-year budgets spread evenly (annual_amount_cents ÷ 12 per month)
 *
 * Budget filtering: only `year === currentYear` budgets are used, repeated as
 * the baseline for all 60 months. This avoids double-counting with past
 * [Remaining] movements already reflected in the starting balance.
 */
export function buildProjectionData(
  startingBalanceCents: number,
  templates: RecurringMovementTemplate[],
  budgets: Budget[],
  currentYear: number,
  months = 60,
): MonthDatum[] {
  const activeTemplates = templates.filter((t) => t.active)

  // Monthly budget deduction: sum current-year budgets ÷ 12
  const currentYearBudgets = budgets.filter((b) => b.year === currentYear)
  const totalAnnualBudgetCents = currentYearBudgets.reduce(
    (sum, b) => sum + b.annual_amount_cents,
    0,
  )
  const monthlyBudgetDeductionCents = Math.round(totalAnnualBudgetCents / 12)

  // Start from the 1st of next month
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() + 2 // getMonth() is 0-indexed, +1 for current month, +1 for next
  if (month > 12) {
    month = 1
    year += 1
  }

  let runningBalance = startingBalanceCents
  const data: MonthDatum[] = []

  for (let i = 0; i < months; i++) {
    // Apply recurring templates
    for (const template of activeTemplates) {
      const instanceDay = clampDay(year, month, template.day_of_month)
      const instanceDate = toISO(year, month, instanceDay)

      if (template.period_type === 'monthly') {
        const withinRange =
          instanceDate >= template.start_date &&
          (template.end_date === null || instanceDate <= template.end_date)
        if (withinRange) {
          runningBalance += template.amount_cents
        }
      } else if (template.period_type === 'annual') {
        if (month === template.month_of_year) {
          const withinRange =
            instanceDate >= template.start_date &&
            (template.end_date === null || instanceDate <= template.end_date)
          if (withinRange) {
            runningBalance += template.amount_cents
          }
        }
      }
    }

    // Apply budget monthly deduction
    runningBalance -= monthlyBudgetDeductionCents

    data.push({
      month: toISO(year, month, 1),
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      balanceCents: runningBalance,
      isYearStart: month === 1,
      yearLabel: month === 1 ? String(year) : '',
    })

    // Advance to next month
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }

  return data
}
