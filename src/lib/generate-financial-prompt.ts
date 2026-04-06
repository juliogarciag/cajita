import type { RecurringMovementTemplate } from '#/lib/recurring-movement-templates-collection.js'
import type { Budget } from '#/lib/budgets-collection.js'
import type { ProjectionScenario } from '#/lib/projection-scenarios-collection.js'
import { buildProjectionData, type MonthDatum } from '#/lib/projection.js'
import { findScript } from '#/lib/projection-scripts/index.js'
import { applyAdjustments } from '#/lib/projection-scripts/apply.js'

const MONTH_NAMES_SHORT = [
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
const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function dollars(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatMonthShort(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number)
  return `${MONTH_NAMES_SHORT[month - 1]} ${year}`
}

function yearlySnapshots(data: MonthDatum[]): MonthDatum[] {
  return data.filter((d) => d.isYearStart)
}

export function generateFinancialPrompt(
  startingBalance: number,
  templates: RecurringMovementTemplate[],
  budgets: Budget[],
  scenarios: ProjectionScenario[],
  today: string,
  currentYear: number,
): string {
  const MONTHS = 600 // 50 years

  const baseData = buildProjectionData(startingBalance, templates, budgets, currentYear, MONTHS)
  const baseYearly = yearlySnapshots(baseData)

  const [y, m, d] = today.split('-').map(Number)
  const formattedDate = `${MONTH_NAMES_LONG[m - 1]} ${d}, ${y}`

  const activeTemplates = templates.filter((t) => t.active)
  const monthlyIncome = activeTemplates.filter(
    (t) => t.period_type === 'monthly' && t.amount_cents > 0,
  )
  const monthlyExpenses = activeTemplates.filter(
    (t) => t.period_type === 'monthly' && t.amount_cents < 0,
  )
  const annualTemplates = activeTemplates.filter((t) => t.period_type === 'annual')

  const currentYearBudgets = budgets.filter((b) => b.year === currentYear)
  const totalBudgetCents = currentYearBudgets.reduce((sum, b) => sum + b.annual_amount_cents, 0)

  const lines: string[] = []

  lines.push(`# Financial Situation Summary — ${formattedDate}`)
  lines.push('')
  lines.push(
    `I'd like your help analyzing my financial situation and suggesting ways to improve it. Below is a structured summary generated from my personal finance tracker.`,
  )
  lines.push('')

  // Current balance
  lines.push('## Current Balance')
  lines.push(`${dollars(startingBalance)} (as of ${formattedDate})`)
  lines.push('')

  // Monthly income
  if (monthlyIncome.length > 0) {
    lines.push('## Monthly Income')
    for (const t of monthlyIncome) {
      const end = t.end_date ? ` until ${formatMonthShort(t.end_date)}` : ''
      lines.push(
        `- **${t.description}**: +${dollars(t.amount_cents)}/month (since ${formatMonthShort(t.start_date)}${end})`,
      )
    }
    lines.push('')
  }

  // Monthly expenses
  if (monthlyExpenses.length > 0) {
    lines.push('## Monthly Expenses')
    for (const t of monthlyExpenses) {
      const end = t.end_date ? ` until ${formatMonthShort(t.end_date)}` : ''
      lines.push(
        `- **${t.description}**: ${dollars(t.amount_cents)}/month (since ${formatMonthShort(t.start_date)}${end})`,
      )
    }
    lines.push('')
  }

  // Annual recurring
  if (annualTemplates.length > 0) {
    lines.push('## Annual Recurring')
    for (const t of annualTemplates) {
      const monthName = MONTH_NAMES_LONG[(t.month_of_year ?? 1) - 1]
      const end = t.end_date ? ` until ${formatMonthShort(t.end_date)}` : ''
      lines.push(`- **${t.description}**: ${dollars(t.amount_cents)}/year (in ${monthName}${end})`)
    }
    lines.push('')
  }

  // Discretionary budgets
  if (currentYearBudgets.length > 0) {
    lines.push(`## Discretionary Budgets (${currentYear})`)
    lines.push('These are spending envelopes that reduce the projected balance each month:')
    for (const b of currentYearBudgets) {
      lines.push(`- **${b.name}**: ${dollars(b.annual_amount_cents)}/year`)
    }
    lines.push(
      `- **Total**: ${dollars(totalBudgetCents)}/year (${dollars(Math.round(totalBudgetCents / 12))}/month)`,
    )
    lines.push('')
  }

  const activeScenarios = scenarios.filter((s) => s.active)

  // Mortgage terms — extracted from active mortgage-payoff scenarios
  const mortgageScenarios = activeScenarios.filter((s) => s.script_id === 'mortgage-payoff')
  if (mortgageScenarios.length > 0) {
    lines.push('## Mortgage Terms')
    lines.push('')

    for (const scenario of mortgageScenarios) {
      const script = findScript(scenario.script_id)
      if (!script) continue

      let raw: Record<string, unknown>
      try {
        const v = scenario.inputs_json
        raw = (typeof v === 'object' && v !== null ? v : JSON.parse(v as string)) as Record<
          string,
          unknown
        >
      } catch {
        continue
      }

      const mortgageInput = raw['mortgage'] as { templateId: string } | undefined
      const loanStartDate = raw['loanStartDate'] as string | undefined
      const originalAmount = raw['originalAmount'] as number | undefined
      const annualRate = raw['annualRate'] as number | undefined
      const extraMonthly = raw['extraMonthly'] as number | undefined
      const repaymentStartDate = raw['repaymentStartDate'] as string | undefined

      const loanTemplate = mortgageInput
        ? templates.find((t) => t.id === mortgageInput.templateId)
        : undefined

      lines.push(`### ${scenario.name}`)

      if (originalAmount != null)
        lines.push(`- **Original loan amount**: ${dollars(originalAmount)}`)
      if (annualRate != null) lines.push(`- **Annual interest rate**: ${annualRate}%`)
      if (loanTemplate)
        lines.push(`- **Monthly payment**: ${dollars(Math.abs(loanTemplate.amount_cents))}`)
      if (loanStartDate) lines.push(`- **Loan start date**: ${formatMonthShort(loanStartDate)}`)

      if (extraMonthly && extraMonthly > 0) {
        lines.push(`- **Extra monthly payment**: ${dollars(extraMonthly)}`)
        if (repaymentStartDate)
          lines.push(`- **Extra payments start**: ${formatMonthShort(repaymentStartDate)}`)
      }

      // Extract payoff date from script output
      try {
        const adjustments = script.run(raw as never, { today, templates })
        const endEntry = adjustments.find((a) => a.type === 'end-template')
        if (endEntry && 'at' in endEntry) {
          lines.push(`- **Estimated payoff date**: ${formatMonthShort(endEntry.at)}`)
        }
      } catch {
        // skip
      }

      lines.push('')
    }
  }

  // Base 50-year projection
  lines.push('## 50-Year Base Projection')
  lines.push('Assumes current income and expenses continue unchanged:')
  lines.push('')
  lines.push('| Year | Projected Balance |')
  lines.push('|------|-------------------|')
  for (const snap of baseYearly) {
    lines.push(`| ${snap.yearLabel} | ${dollars(snap.balanceCents)} |`)
  }
  lines.push('')

  // Scenarios
  if (activeScenarios.length > 0) {
    lines.push('## What-If Scenarios')
    lines.push('')

    for (const scenario of activeScenarios) {
      const script = findScript(scenario.script_id)
      if (!script) continue

      let raw: Record<string, unknown>
      try {
        const v = scenario.inputs_json
        raw = (typeof v === 'object' && v !== null ? v : JSON.parse(v as string)) as Record<
          string,
          unknown
        >
      } catch {
        continue
      }

      let adjustments
      try {
        adjustments = script.run(raw as never, { today, templates })
      } catch {
        continue
      }

      const adjustedTemplates = applyAdjustments(templates, adjustments)
      const scenarioData = buildProjectionData(
        startingBalance,
        adjustedTemplates,
        budgets,
        currentYear,
        MONTHS,
      )
      const scenarioYearly = yearlySnapshots(scenarioData)

      lines.push(`### ${scenario.name}`)
      lines.push('')
      lines.push('| Year | Projected Balance | vs. Base |')
      lines.push('|------|-------------------|----------|')
      for (let i = 0; i < scenarioYearly.length; i++) {
        const snap = scenarioYearly[i]
        const base = baseYearly[i]
        const delta = snap.balanceCents - (base?.balanceCents ?? 0)
        const deltaStr = delta >= 0 ? `+${dollars(delta)}` : dollars(delta)
        lines.push(`| ${snap.yearLabel} | ${dollars(snap.balanceCents)} | ${deltaStr} |`)
      }
      lines.push('')
    }
  }

  // Closing questions
  lines.push('## Please Help Me With')
  lines.push('')
  lines.push(
    '1. **When and how should I start investing?** (e.g., index funds, retirement accounts — given my current trajectory)',
  )
  lines.push(
    '2. **How do the what-if scenarios compare?** Which path leads to better long-term financial health?',
  )
  lines.push('3. **What are the biggest risks or blind spots** in my current financial trajectory?')
  lines.push('4. **What 2–3 changes would have the most impact** on my financial future?')
  lines.push('')
  lines.push('Please be specific and use the numbers above to ground your suggestions.')

  return lines.join('\n')
}
