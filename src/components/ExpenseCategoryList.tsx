import { useMemo, useState, useCallback } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  expenseCategoriesCollection,
  type ExpenseCategory,
} from '#/lib/expense-categories-collection.js'
import { expenseItemsCollection } from '#/lib/expense-items-collection.js'
import { formatCents, formatSoles } from '#/lib/format.js'
import { createExpenseCategory, deleteExpenseCategory } from '#/server/expense-categories.js'
import { categoryColors, DEFAULT_CATEGORY_COLOR } from '#/lib/category-colors.js'
import { ConfirmButton } from './ConfirmButton.js'

type CategoryTotals = { usd: number; soles: number; count: number }

export function ExpenseCategoryList() {
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addColor, setAddColor] = useState(DEFAULT_CATEGORY_COLOR)

  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: expenseCategoriesCollection }).orderBy(({ c }) => c.name, 'asc'),
  )

  const { data: items } = useLiveQuery((q) => q.from({ i: expenseItemsCollection }))

  const totalsByCategory = useMemo(() => {
    const map = new Map<string, CategoryTotals>()
    for (const item of items) {
      const totals = map.get(item.expense_category_id) ?? { usd: 0, soles: 0, count: 0 }
      totals.usd += item.amount_usd_cents ?? 0
      totals.soles += item.amount_soles_cents ?? 0
      totals.count += 1
      map.set(item.expense_category_id, totals)
    }
    return map
  }, [items])

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
        <h1 className="text-2xl font-bold">Expense Categories</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          <Plus size={16} />
          Add Category
        </button>
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
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Color</label>
              <div className="flex gap-1.5">
                {categoryColors.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    onClick={() => setAddColor(c.value)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${addColor === c.value ? 'scale-110 border-gray-900' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-gray-500">No expense categories yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category: ExpenseCategory) => {
            const totals = totalsByCategory.get(category.id) ?? { usd: 0, soles: 0, count: 0 }

            return (
              <div
                key={category.id}
                data-category-card={category.id}
                className="relative rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
              >
                <Link
                  to="/finances/expense-categories/$categoryId"
                  params={{ categoryId: category.id }}
                  className="absolute inset-0 rounded-lg"
                />
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="font-medium text-gray-900">{category.name}</span>
                  </div>
                  <ConfirmButton
                    onConfirm={() => handleDelete(category.id)}
                    className="relative z-10 rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    confirmClassName="relative z-10 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    ×
                  </ConfirmButton>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {totals.count} {totals.count === 1 ? 'expense' : 'expenses'}
                  </span>
                  <span className="flex items-center gap-2">
                    {totals.soles !== 0 && <span>{formatSoles(totals.soles)}</span>}
                    {totals.usd !== 0 && <span>{formatCents(totals.usd)}</span>}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
