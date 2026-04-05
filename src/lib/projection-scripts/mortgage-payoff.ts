import { defineScript, templateInput, dateInput, amountInput } from './types.js'

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
      ...(extraMonthly != null
        ? [
            {
              type: 'add-template' as const,
              template: {
                description: 'Extra mortgage payment',
                amount_cents: -Math.abs(extraMonthly),
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
