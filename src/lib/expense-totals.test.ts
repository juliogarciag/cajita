import { describe, it, expect } from 'vitest'
import {
  expenseTotals,
  expenseTotalsByYear,
  isPendingExchange,
  type CountableExpense,
} from './expense-totals.js'

const item = (over: Partial<CountableExpense> = {}): CountableExpense => ({
  date: '2026-03-10',
  expense_category_id: 'cat',
  amount_usd_cents: null,
  amount_soles_cents: null,
  ...over,
})

describe('isPendingExchange', () => {
  it('is soles with no USD amount', () => {
    expect(isPendingExchange(item({ amount_soles_cents: 45000 }))).toBe(true)
  })

  it('is not pending once a USD amount exists', () => {
    expect(isPendingExchange(item({ amount_soles_cents: 45000, amount_usd_cents: 12000 }))).toBe(
      false,
    )
  })

  it('leaves a soles reimbursement out — it is not waiting to be exchanged', () => {
    expect(isPendingExchange(item({ amount_soles_cents: -15000 }))).toBe(false)
  })

  it('ignores an item with no amounts at all', () => {
    expect(isPendingExchange(item())).toBe(false)
  })
})

describe('expenseTotals', () => {
  it('subtracts a reimbursement from the USD total', () => {
    const totals = expenseTotals([
      item({ amount_usd_cents: 24000 }),
      item({ amount_usd_cents: 8250 }),
      item({ amount_usd_cents: -12000 }),
    ])
    expect(totals.usd).toBe(20250)
    expect(totals.count).toBe(3)
    expect(totals.pendingSoles).toBe(0)
  })

  it('counts only the soles that are actually outstanding', () => {
    const totals = expenseTotals([
      item({ amount_soles_cents: 45000 }),
      item({ amount_soles_cents: -15000 }),
    ])
    // Not 30,000: the reimbursement is its own row, but netting it here would
    // understate how much is still waiting to be exchanged.
    expect(totals.pendingSoles).toBe(45000)
    expect(totals.pendingCount).toBe(1)
    expect(totals.count).toBe(2)
  })

  it('keeps the pending bucket out of the USD total', () => {
    const totals = expenseTotals([
      item({ amount_usd_cents: 10000 }),
      item({ amount_soles_cents: 45000 }),
    ])
    expect(totals.usd).toBe(10000)
    expect(totals.pendingSoles).toBe(45000)
  })
})

describe('expenseTotalsByYear', () => {
  it('splits by category and drops other years', () => {
    const byCategory = expenseTotalsByYear(
      [
        item({ expense_category_id: 'a', amount_usd_cents: 5000 }),
        item({ expense_category_id: 'a', amount_usd_cents: -2000 }),
        item({ expense_category_id: 'b', amount_soles_cents: 30000 }),
        item({ expense_category_id: 'a', amount_usd_cents: 9999, date: '2025-12-31' }),
      ],
      2026,
    )
    expect(byCategory.get('a')).toEqual({ usd: 3000, pendingSoles: 0, pendingCount: 0, count: 2 })
    expect(byCategory.get('b')).toEqual({
      usd: 0,
      pendingSoles: 30000,
      pendingCount: 1,
      count: 1,
    })
  })

  it('has no entry for a category with nothing that year', () => {
    expect(expenseTotalsByYear([item({ date: '2024-01-01' })], 2026).size).toBe(0)
  })
})
