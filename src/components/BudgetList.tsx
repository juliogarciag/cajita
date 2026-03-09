import { useMemo, useState, useCallback } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Plus } from 'lucide-react'
import { budgetsCollection, type Budget } from '#/lib/budgets-collection.js'
import { budgetItemsCollection } from '#/lib/budget-items-collection.js'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'
import { formatCents } from '#/lib/format.js'
import { createBudget, deleteBudget } from '#/server/budgets.js'
import { BudgetDetail } from './BudgetDetail.js'

export function BudgetList() {
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addCategoryId, setAddCategoryId] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addYear, setAddYear] = useState(new Date().getFullYear())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: budgets } = useLiveQuery((q) =>
    q.from({ b: budgetsCollection }).orderBy(({ b }) => b.year, 'desc'),
  )

  const { data: budgetItems } = useLiveQuery((q) =>
    q.from({ bi: budgetItemsCollection }),
  )

  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }).orderBy(({ c }) => c.sort_order, 'asc'),
  )

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    for (const cat of categories) map.set(cat.id, cat)
    return map
  }, [categories])

  // Sum items per budget
  const budgetTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of budgetItems) {
      map.set(item.budget_id, (map.get(item.budget_id) ?? 0) + item.amount_cents)
    }
    return map
  }, [budgetItems])

  // Categories that already have a budget for the selected year
  const usedCategoryIds = useMemo(() => {
    return new Set(
      budgets
        .filter((b: Budget) => b.year === addYear)
        .map((b: Budget) => b.category_id),
    )
  }, [budgets, addYear])

  const availableCategories = useMemo(
    () => categories.filter((c: Category) => !usedCategoryIds.has(c.id)),
    [categories, usedCategoryIds],
  )

  // Group by year
  const budgetsByYear = useMemo(() => {
    const map = new Map<number, Budget[]>()
    for (const b of budgets) {
      if (!map.has(b.year)) map.set(b.year, [])
      map.get(b.year)!.push(b)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [budgets])

  const handleAdd = useCallback(async () => {
    if (!addCategoryId || !addAmount) return
    const cents = Math.round(Number.parseFloat(addAmount) * 100)
    if (Number.isNaN(cents) || cents <= 0) return

    await createBudget({
      data: {
        category_id: addCategoryId,
        year: addYear,
        annual_amount_cents: cents,
      },
    })

    setShowAddForm(false)
    setAddCategoryId('')
    setAddAmount('')
  }, [addCategoryId, addAmount, addYear])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteBudget({ data: { id } })
      setDeletingId(null)
      if (selectedBudgetId === id) setSelectedBudgetId(null)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete budget')
      setDeletingId(null)
    }
  }, [selectedBudgetId])

  const selectedBudget = selectedBudgetId
    ? budgets.find((b: Budget) => b.id === selectedBudgetId)
    : null

  if (selectedBudget) {
    const cat = categoryMap.get(selectedBudget.category_id)
    return (
      <BudgetDetail
        budget={selectedBudget}
        categoryName={cat?.name ?? 'Unknown'}
        categoryColor={cat?.color ?? null}
        onBack={() => setSelectedBudgetId(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Budgets</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          <Plus size={16} />
          Add Budget
        </button>
      </div>

      {showAddForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-700">New Budget</h3>
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Year</label>
              <input
                type="number"
                value={addYear}
                onChange={(e) => setAddYear(Number(e.target.value))}
                className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Category</label>
              <select
                value={addCategoryId}
                onChange={(e) => setAddCategoryId(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Select category...</option>
                {availableCategories.map((c: Category) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Annual Amount (USD)</label>
              <input
                type="text"
                placeholder="500.00"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                inputMode="decimal"
                className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={handleAdd}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
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
        </div>
      )}

      {budgetsByYear.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-gray-500">No budgets yet. Create your first one.</p>
        </div>
      ) : (
        budgetsByYear.map(([year, yearBudgets]) => (
          <div key={year} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-gray-700">{year}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {yearBudgets.map((budget: Budget) => {
                const cat = categoryMap.get(budget.category_id)
                const itemsTotal = budgetTotals.get(budget.id) ?? 0
                // items are negative, so spent = abs(itemsTotal)
                const spentCents = Math.abs(itemsTotal)
                const annualCents = budget.annual_amount_cents
                const remainingCents = annualCents + itemsTotal // annual + negative items
                const pct = annualCents > 0 ? Math.min((spentCents / annualCents) * 100, 100) : 0

                return (
                  <div
                    key={budget.id}
                    className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
                    onClick={() => setSelectedBudgetId(budget.id)}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {cat?.color && (
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                        )}
                        <span className="font-medium text-gray-900">
                          {cat?.name ?? 'Unknown'}
                        </span>
                      </div>
                      {deletingId === budget.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDelete(budget.id)}
                            className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeletingId(budget.id)
                          }}
                          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <div className="mb-1 text-sm text-gray-500">
                      Budget: {formatCents(annualCents)}
                    </div>

                    {/* Progress bar */}
                    <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        Spent: {formatCents(spentCents)} ({pct.toFixed(0)}%)
                      </span>
                      <span className={remainingCents < 0 ? 'text-red-600 font-medium' : ''}>
                        Remaining: {formatCents(remainingCents)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
