import { useMemo, useState, useCallback } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { budgetsCollection, type Budget } from '#/lib/budgets-collection.js'
import { budgetItemsCollection } from '#/lib/budget-items-collection.js'
import { categoriesCollection } from '#/lib/categories-collection.js'
import { formatCents } from '#/lib/format.js'
import { createBudget, deleteBudget } from '#/server/budgets.js'
import { budgetColors, DEFAULT_BUDGET_COLOR } from '#/lib/budget-colors.js'
import { ConfirmButton } from './ConfirmButton.js'

export function BudgetList() {
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addColor, setAddColor] = useState(DEFAULT_BUDGET_COLOR)
  const [addAmount, setAddAmount] = useState('')
  const [addYear, setAddYear] = useState(new Date().getFullYear())

  const { data: budgets } = useLiveQuery((q) =>
    q.from({ b: budgetsCollection }).orderBy(({ b }) => b.year, 'desc'),
  )

  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }),
  )

  const { data: budgetItems } = useLiveQuery((q) =>
    q.from({ bi: budgetItemsCollection }),
  )

  // Category color lookup
  const categoryColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.color)
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

  // Budgets that have synced movements (cannot be deleted)
  const budgetsWithSyncedItems = useMemo(() => {
    const set = new Set<string>()
    for (const item of budgetItems) {
      if (item.movement_id) set.add(item.budget_id)
    }
    return set
  }, [budgetItems])

  // Group by year
  const budgetsByYear = useMemo(() => {
    const map = new Map<number, Budget[]>()
    for (const b of budgets) {
      if (!map.has(b.year)) map.set(b.year, [])
      map.get(b.year)!.push(b)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [budgets])

  const canCreate = addName.trim() && addAmount

  const handleAdd = useCallback(async () => {
    if (!addName.trim() || !addAmount) return
    const cents = Math.round(Number.parseFloat(addAmount) * 100)
    if (Number.isNaN(cents) || cents <= 0) return

    try {
      await createBudget({
        data: {
          name: addName.trim(),
          color: addColor,
          year: addYear,
          annual_amount_cents: cents,
        },
      })

      setShowAddForm(false)
      setAddName('')
      setAddColor(DEFAULT_BUDGET_COLOR)
      setAddAmount('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create budget')
    }
  }, [addName, addColor, addAmount, addYear])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteBudget({ data: { id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete budget')
    }
  }, [])

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
          <div className="flex flex-col gap-3">
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
                <label className="text-xs text-gray-500">Name</label>
                <input
                  type="text"
                  placeholder="Budget name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-40 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
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
                {budgetColors.map((c) => (
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
                const itemsTotal = budgetTotals.get(budget.id) ?? 0
                const spentCents = Math.abs(itemsTotal)
                const annualCents = budget.annual_amount_cents
                const remainingCents = annualCents + itemsTotal
                const pct = annualCents > 0 ? Math.min((spentCents / annualCents) * 100, 100) : 0
                const color = categoryColorMap.get(budget.category_id) ?? '#6b7280'

                return (
                  <div
                    key={budget.id}
                    className="relative rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <Link
                      to="/finances/budgets/$budgetId"
                      params={{ budgetId: budget.id }}
                      className="absolute inset-0 rounded-lg"
                    />
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-medium text-gray-900">
                          {budget.name}
                        </span>
                      </div>
                      {!budgetsWithSyncedItems.has(budget.id) && (
                        <ConfirmButton
                          onConfirm={() => handleDelete(budget.id)}
                          className="relative z-10 rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          confirmClassName="relative z-10 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          ×
                        </ConfirmButton>
                      )}
                    </div>

                    <div className="mb-1 text-sm text-gray-500">
                      Budget: {formatCents(annualCents)}
                    </div>

                    <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }}
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
