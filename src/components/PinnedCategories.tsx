import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { expenseCategoriesCollection } from '#/lib/expense-categories-collection.js'
import { expenseItemsCollection } from '#/lib/expense-items-collection.js'
import { formatCents, formatSoles } from '#/lib/format.js'

/**
 * Dashboard cards for categories the user pinned. Totals are for the current
 * calendar year, matching what the categories page shows by default — a pinned
 * card is meant to answer "how am I doing this year" at a glance.
 */
export function PinnedCategories() {
  const year = new Date().getFullYear()
  const { data: categories } = useLiveQuery((q) => q.from({ c: expenseCategoriesCollection }))
  const { data: items } = useLiveQuery((q) => q.from({ i: expenseItemsCollection }))

  const pinned = useMemo(
    () => categories.filter((c) => c.pinned).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  )

  const totals = useMemo(() => {
    const byCategory = new Map<string, { usd: number; pendingSoles: number; count: number }>()
    for (const item of items) {
      if (!item.date.startsWith(String(year))) continue
      const entry = byCategory.get(item.expense_category_id) ?? {
        usd: 0,
        pendingSoles: 0,
        count: 0,
      }
      entry.count++
      if (item.amount_usd_cents != null) entry.usd += item.amount_usd_cents
      // Soles with no USD haven't been exchanged yet; they're pending, not zero.
      else if (item.amount_soles_cents != null) entry.pendingSoles += item.amount_soles_cents
      byCategory.set(item.expense_category_id, entry)
    }
    return byCategory
  }, [items, year])

  if (pinned.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-gray-700">Categories - {year}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pinned.map((category) => {
          const t = totals.get(category.id) ?? { usd: 0, pendingSoles: 0, count: 0 }
          return (
            <Link
              key={category.id}
              to="/finances/expense-categories/$categoryId"
              params={{ categoryId: category.id }}
              search={{ year }}
              data-pinned-category={category.id}
              className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="font-medium text-gray-900">{category.name}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-semibold text-gray-900">{formatCents(t.usd)}</span>
                <span className="text-xs text-gray-500">
                  {t.count} {t.count === 1 ? 'expense' : 'expenses'}
                </span>
              </div>
              {t.pendingSoles > 0 && (
                <div
                  className="mt-1 text-xs text-amber-600"
                  title="Soles on items with no USD amount yet — pending exchange"
                >
                  {formatSoles(t.pendingSoles)} pending
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
