/**
 * How a pile of expense items adds up.
 *
 * Three screens ask this question — the categories table, a category's own
 * page, and the pinned dashboard cards — and they used to answer it with three
 * copies of the same reduce. The rules below are subtle enough that three
 * copies is three chances to drift, so they live here instead.
 */

/** The fields the totals depend on — anything shaped like this will do. */
export interface CountableExpense {
  date: string
  expense_category_id: string
  amount_usd_cents: number | null
  amount_soles_cents: number | null
}

export interface ExpenseTotals {
  /** The canonical total. Negative amounts are reimbursements and subtract. */
  usd: number
  /** Soles still waiting to be exchanged. */
  pendingSoles: number
  /** How many items make up `pendingSoles`. */
  pendingCount: number
  /** Every item, pending or not. */
  count: number
}

/**
 * Soles with no USD amount are money not exchanged yet.
 *
 * A *negative* soles amount is a reimbursement — soles that came back — so it
 * isn't waiting to be converted and is left out of the bucket entirely. It
 * still shows as its own row; it just doesn't net against what's pending,
 * which would understate how much is actually outstanding.
 */
export function isPendingExchange(item: CountableExpense): boolean {
  return item.amount_usd_cents == null && (item.amount_soles_cents ?? 0) > 0
}

export function emptyTotals(): ExpenseTotals {
  return { usd: 0, pendingSoles: 0, pendingCount: 0, count: 0 }
}

export function addExpense(totals: ExpenseTotals, item: CountableExpense): ExpenseTotals {
  totals.usd += item.amount_usd_cents ?? 0
  if (isPendingExchange(item)) {
    totals.pendingSoles += item.amount_soles_cents ?? 0
    totals.pendingCount += 1
  }
  totals.count += 1
  return totals
}

export function expenseTotals(items: readonly CountableExpense[]): ExpenseTotals {
  return items.reduce(addExpense, emptyTotals())
}

/** Per-category totals for one calendar year. */
export function expenseTotalsByYear(
  items: readonly CountableExpense[],
  year: number,
): Map<string, ExpenseTotals> {
  const prefix = String(year)
  const byCategory = new Map<string, ExpenseTotals>()
  for (const item of items) {
    if (item.date.slice(0, 4) !== prefix) continue
    const totals = byCategory.get(item.expense_category_id) ?? emptyTotals()
    byCategory.set(item.expense_category_id, addExpense(totals, item))
  }
  return byCategory
}
