import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { expenseCategoriesCollection } from '#/lib/expense-categories-collection.js'
import { expenseItemsCollection } from '#/lib/expense-items-collection.js'
import { formatCents, formatSoles } from '#/lib/format.js'
import { reorderExpenseCategories } from '#/server/expense-categories.js'

/**
 * Dashboard cards for categories the user pinned. Totals are for the current
 * calendar year, matching what the categories page shows by default — a pinned
 * card is meant to answer "how am I doing this year" at a glance.
 */
export function PinnedCategories() {
  const year = new Date().getFullYear()
  const { data: categories } = useLiveQuery((q) => q.from({ c: expenseCategoriesCollection }))
  const { data: items } = useLiveQuery((q) => q.from({ i: expenseItemsCollection }))

  // Hand-arranged order, falling back to alphabetical while every card still
  // has the default sort_order of 0.
  const synced = useMemo(
    () =>
      categories
        .filter((c) => c.pinned)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [categories],
  )

  // A local copy so a drop reorders instantly instead of waiting for the round
  // trip; it re-syncs whenever the collection itself changes.
  const [pinned, setPinned] = useState(synced)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  useEffect(() => setPinned(synced), [synced])

  // The dragged id comes off the dataTransfer rather than from state: the drop
  // handler is a closure from the render that was current when the drag began,
  // so reading state here would depend on a re-render having happened first.
  const handleDrop = (draggedId: string, targetId: string) => {
    setDraggingId(null)
    if (!draggedId || draggedId === targetId) return

    const next = [...pinned]
    const from = next.findIndex((c) => c.id === draggedId)
    const to = next.findIndex((c) => c.id === targetId)
    if (from === -1 || to === -1) return

    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setPinned(next)
    void reorderExpenseCategories({ data: { ids: next.map((c) => c.id) } })
  }

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
      {/* One column per pinned category, so they sit on a single row however
          many there are. Stacked below sm, where four across is unreadable. */}
      <div
        className="grid grid-cols-1 gap-3 sm:[grid-template-columns:repeat(var(--pinned),minmax(0,1fr))]"
        style={{ '--pinned': pinned.length } as React.CSSProperties}
      >
        {pinned.map((category) => {
          const t = totals.get(category.id) ?? { usd: 0, pendingSoles: 0, count: 0 }
          return (
            <Link
              key={category.id}
              to="/finances/expense-categories/$categoryId"
              params={{ categoryId: category.id }}
              search={{ year }}
              data-pinned-category={category.id}
              draggable
              onDragStart={(e) => {
                setDraggingId(category.id)
                // Firefox won't start a drag without data on the transfer
                e.dataTransfer.setData('text/plain', category.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                // Only preventDefault marks this a valid drop target
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                // Otherwise the browser treats the dragged text as a navigation
                e.preventDefault()
                handleDrop(e.dataTransfer.getData('text/plain'), category.id)
              }}
              onDragEnd={() => setDraggingId(null)}
              className={`rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md ${
                draggingId === category.id ? 'opacity-40' : ''
              } ${draggingId && draggingId !== category.id ? 'border-dashed' : ''}`}
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
                  title="Soles on items with no USD amount yet"
                >
                  {formatSoles(t.pendingSoles)} pending exchange
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
