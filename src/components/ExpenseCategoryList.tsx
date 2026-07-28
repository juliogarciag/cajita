import { useMemo, useState, useCallback } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Pin, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { setCategoryPinned } from '#/lib/pin-category.js'
import {
  expenseCategoriesCollection,
  type ExpenseCategory,
} from '#/lib/expense-categories-collection.js'
import { expenseItemsCollection } from '#/lib/expense-items-collection.js'
import { formatCents, formatSoles } from '#/lib/format.js'
import { createExpenseCategory, deleteExpenseCategory } from '#/server/expense-categories.js'
import { DEFAULT_CATEGORY_COLOR } from '#/lib/category-colors.js'
import { ColorPicker } from './ColorPicker.js'
import { ConfirmButton } from './ConfirmButton.js'
import { YearSwitcher } from './YearSwitcher.js'

type CategoryTotals = { usd: number; pendingSoles: number; count: number }

export function ExpenseCategoryList() {
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addColor, setAddColor] = useState(DEFAULT_CATEGORY_COLOR)

  const { year } = useSearch({ strict: false }) as { year?: number }
  const navigate = useNavigate()

  const currentYear = new Date().getFullYear()
  const selectedYear = year ?? currentYear

  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: expenseCategoriesCollection }).orderBy(({ c }) => c.name, 'asc'),
  )

  const { data: items } = useLiveQuery((q) => q.from({ i: expenseItemsCollection }))

  // Totals cover the selected year only. USD is the canonical total; soles on
  // items without a USD amount are "pending" (not yet exchanged).
  const totalsByCategory = useMemo(() => {
    const map = new Map<string, CategoryTotals>()
    for (const item of items) {
      if (item.date.slice(0, 4) !== String(selectedYear)) continue
      const totals = map.get(item.expense_category_id) ?? { usd: 0, pendingSoles: 0, count: 0 }
      totals.usd += item.amount_usd_cents ?? 0
      if (item.amount_usd_cents == null && item.amount_soles_cents != null) {
        totals.pendingSoles += item.amount_soles_cents
      }
      totals.count += 1
      map.set(item.expense_category_id, totals)
    }
    return map
  }, [items, selectedYear])

  // Deletion cascades across every year, so the guard counts all items — not
  // just the ones in view.
  const allTimeCountByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      map.set(item.expense_category_id, (map.get(item.expense_category_id) ?? 0) + 1)
    }
    return map
  }, [items])

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear, selectedYear])
    for (const item of items) years.add(Number(item.date.slice(0, 4)))
    return [...years].sort((a, b) => b - a)
  }, [items, currentYear, selectedYear])

  const handleSelectYear = (y: number) => {
    void navigate({ to: '/finances/expense-categories', search: { year: y } })
  }

  const canCreate = addName.trim().length > 0

  const handleAdd = useCallback(async () => {
    if (!addName.trim()) return

    try {
      await createExpenseCategory({
        data: { name: addName.trim(), color: addColor },
      })

      setShowAddForm(false)
      setAddName('')
      setAddColor(DEFAULT_CATEGORY_COLOR)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create category')
    }
  }, [addName, addColor])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteExpenseCategory({ data: { id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete category')
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categories</h1>
        <div className="flex items-center gap-3">
          <YearSwitcher
            years={availableYears}
            selected={selectedYear}
            onSelect={handleSelectYear}
          />
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus size={16} />
            Add Category
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-700">New Category</h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Name</label>
                <input
                  type="text"
                  placeholder="Category name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canCreate) handleAdd()
                  }}
                  autoFocus
                  className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={!canCreate}
                className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500">Color</label>
              <ColorPicker value={addColor} onChange={setAddColor} />
            </div>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-gray-500">No categories yet. Create your first one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="w-[110px] px-3 py-2 text-right font-medium">Expenses</th>
                <th className="w-[170px] px-3 py-2 text-right font-medium">Pending exchange</th>
                <th className="w-[140px] px-3 py-2 text-right font-medium">Total</th>
                <th className="w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {categories.map((category: ExpenseCategory) => {
                const totals = totalsByCategory.get(category.id) ?? {
                  usd: 0,
                  pendingSoles: 0,
                  count: 0,
                }
                const allTimeCount = allTimeCountByCategory.get(category.id) ?? 0

                return (
                  <tr
                    key={category.id}
                    data-category-row={category.id}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2">
                      <Link
                        to="/finances/expense-categories/$categoryId"
                        params={{ categoryId: category.id }}
                        search={{ year: selectedYear }}
                        className="flex items-center gap-2 font-medium text-gray-900 hover:underline"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {totals.count}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {totals.pendingSoles > 0 ? (
                        <span
                          className="text-amber-600"
                          title="Soles on items with no USD amount yet — not exchanged"
                        >
                          {formatSoles(totals.pendingSoles)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">
                      {formatCents(totals.usd)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => void setCategoryPinned(category.id, !category.pinned)}
                          aria-pressed={category.pinned ?? false}
                          title={category.pinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
                          aria-label={
                            category.pinned
                              ? `Unpin ${category.name} from dashboard`
                              : `Pin ${category.name} to dashboard`
                          }
                          className={`rounded p-1 hover:bg-gray-100 ${
                            category.pinned ? 'text-gray-900' : 'text-gray-300 hover:text-gray-600'
                          }`}
                        >
                          <Pin size={14} fill={category.pinned ? 'currentColor' : 'none'} />
                        </button>
                        {allTimeCount > 0 ? (
                          <span
                            title={`Delete the ${allTimeCount} expenses in this category first`}
                            aria-label="Cannot delete a category with expenses"
                            className="cursor-not-allowed px-2 py-0.5 text-xs text-gray-200"
                          >
                            ×
                          </span>
                        ) : (
                          <ConfirmButton
                            onConfirm={() => handleDelete(category.id)}
                            title="Delete category?"
                            description={
                              <>
                                <span className="font-medium text-gray-900">{category.name}</span>{' '}
                                will be removed. It has no expenses, so nothing else is lost.
                              </>
                            }
                            confirmLabel="Delete category"
                            className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          >
                            ×
                          </ConfirmButton>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
