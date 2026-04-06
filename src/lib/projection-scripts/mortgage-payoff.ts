import { defineScript, templateInput, dateInput, amountInput, percentageInput } from './types.js'

/**
 * Simulate amortization from `fromDate` to `toDate` and return the remaining balance.
 * Assumes payments are made on the 1st of each month.
 */
function balanceAt(
  originalAmountCents: number,
  annualRatePct: number,
  monthlyPaymentCents: number,
  fromDate: string,
  toDate: string,
): number {
  const monthlyRate = annualRatePct / 100 / 12
  let balance = originalAmountCents

  let [y, m] = fromDate.slice(0, 7).split('-').map(Number) as [number, number]
  const [toY, toM] = toDate.slice(0, 7).split('-').map(Number) as [number, number]

  while (y < toY || (y === toY && m <= toM)) {
    if (balance <= 0) break
    const interest = balance * monthlyRate
    const principal = Math.max(0, monthlyPaymentCents - interest)
    balance -= principal
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  return Math.max(0, balance)
}

/**
 * Starting from `fromDate` with `currentBalanceCents`, simulate forward with
 * `monthlyPaymentCents` + `extraMonthlyCents` until the balance hits zero.
 * Returns the payoff date as YYYY-MM-DD.
 */
function computePayoffDate(
  currentBalanceCents: number,
  annualRatePct: number,
  monthlyPaymentCents: number,
  extraMonthlyCents: number,
  fromDate: string,
): string {
  const monthlyRate = annualRatePct / 100 / 12
  const totalPayment = monthlyPaymentCents + extraMonthlyCents
  let balance = currentBalanceCents

  let [y, m] = fromDate.slice(0, 7).split('-').map(Number) as [number, number]

  // Safety cap: 50 years
  for (let i = 0; i < 600; i++) {
    if (balance <= 0) break
    const interest = balance * monthlyRate
    const principal = Math.min(balance, totalPayment - interest)
    balance -= principal

    if (balance <= 0) {
      return `${y}-${String(m).padStart(2, '0')}-01`
    }

    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  return `${y}-${String(m).padStart(2, '0')}-01`
}

export const mortgagePayoffScript = defineScript({
  id: 'mortgage-payoff',
  name: 'Mortgage payoff',
  inputs: {
    mortgage: templateInput({ label: 'Mortgage template' }),
    loanStartDate: dateInput({ label: 'Loan start date' }),
    originalAmount: amountInput({ label: 'Original loan amount' }),
    annualRate: percentageInput({ label: 'Annual interest rate (%)' }),
    extraMonthly: amountInput({ label: 'Extra monthly payment', optional: true }),
  },
  run({ mortgage, loanStartDate, originalAmount, annualRate, extraMonthly }, { today, templates }) {
    const template = templates.find((t) => t.id === mortgage.templateId)
    if (!template) throw new Error(`Template ${mortgage.templateId} not found`)

    const monthlyPayment = Math.abs(template.amount_cents)
    const extra = extraMonthly ?? 0

    // Derive current balance from original loan terms
    const currentBalance = balanceAt(
      originalAmount,
      annualRate,
      monthlyPayment,
      loanStartDate,
      today,
    )

    // Compute new payoff date with extra payment
    const payoffDate = computePayoffDate(currentBalance, annualRate, monthlyPayment, extra, today)

    return [
      { type: 'end-template', templateId: mortgage.templateId, at: payoffDate },
      ...(extra > 0
        ? [
            {
              type: 'add-template' as const,
              template: {
                description: 'Extra mortgage payment',
                amount_cents: -extra,
                period_type: 'monthly' as const,
                start_date: today,
                end_date: payoffDate,
              },
            },
          ]
        : []),
    ]
  },
})
