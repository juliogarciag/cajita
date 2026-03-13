import { useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { eq } from '@tanstack/db'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { budgetItemsCollection, type BudgetItem } from '#/lib/budget-items-collection.js'
import { budgetsCollection } from '#/lib/budgets-collection.js'
import { categoriesCollection } from '#/lib/categories-collection.js'
import { movementsCollection } from '#/lib/movements-collection.js'
import { checkpointsCollection } from '#/lib/checkpoints-collection.js'
import { formatCents, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { useCheckpointBoundary } from '#/lib/use-checkpoint-boundary.js'
import {
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  syncBudgetItem,
  unsyncBudgetItem,
} from '#/server/budget-items.js'
import { updateBudget } from '#/server/budgets.js'
import { BudgetItemRow } from './BudgetItemRow.js'
import { DateInput } from './DateInput.js'

export function BudgetDetail() {
  const { budgetId } = useParams({ strict: false }) as { budgetId: string }

  const [showAddForm, setShowAddForm] = useState(false)
  const [addDesc, setAddDesc] = useState('')
  const [addDate, setAddDate] = useState(toISODate(new Date()))
  const [addLocalCents, setAddLocalCents] = useState('')
  const [addAmountCents, setAddAmountCents] = useState('')
  const [editingAnnual, setEditingAnnual] = useState(false)
  const [annualDraft, setAnnualDraft] = useState('')

  const { data: budgets } = useLiveQuery((q) =>
    q.from({ b: budgetsCollection }),
  )

  const budget = budgets.find((b) => b.id === budgetId)

  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }),
  )

  const budgetColor = budget
    ? (categories.find((c) => c.id === budget.category_id)?.color ?? '#6b7280')
    : '#6b7280'

  const { data: items } = useLiveQuery((q) =>
    q
      .from({ bi: budgetItemsCollection })
      .where(({ bi }) => eq(bi.budget_id, budgetId))
      .orderBy(({ bi }) => bi.sort_position, 'asc'),
  )

  const { data: movements } = useLiveQuery((q) =>
    q.from({ m: movementsCollection }),
  )

  const { data: checkpoints } = useLiveQuery((q) =>
    q.from({ c: checkpointsCollection }).orderBy(({ c }) => c.created_at, 'desc'),
  )

  const { frozenMovementIds } = useCheckpointBoundary(checkpoints, movements)

  if (!budget) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-gray-500">Budget not found.</p>
        <Link
          to="/finances/budgets"
          className="text-sm text-blue-600 hover:underline"
        >
          Back to budgets
        </Link>
      </div>
    )
  }

  // Totals
  const itemsTotal = items.reduce((sum: number, i: BudgetItem) => sum + i.amount_cents, 0)
  const spentCents = Math.abs(itemsTotal)
  const annualCents = budget.annual_amount_cents
  const remainingCents = annualCents + itemsTotal
  const pct = annualCents > 0 ? Math.min((spentCents / annualCents) * 100, 100) : 0

  const handleAdd = async () => {
    if (!addDesc) return
    const usdCents = addAmountCents ? parseDollarsTocents(addAmountCents) : 0
    const localCents = addLocalCents ? parseDollarsTocents(addLocalCents) : null

    try {
      await createBudgetItem({
        data: {
          budget_id: budget.id,
          description: addDesc,
          date: addDate,
          amount_local_cents: localCents ? -Math.abs(localCents) : null,
          amount_cents: usdCents ? -Math.abs(usdCents) : 0,
        },
      })

      setShowAddForm(false)
      setAddDesc('')
      setAddDate(toISODate(new Date()))
      setAddLocalCents('')
      setAddAmountCents('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add item')
    }
  }

  const handleUpdate = async (id: string, updates: Partial<Pick<BudgetItem, 'description' | 'date' | 'amount_local_cents' | 'amount_cents' | 'accounting_date'>>) => {
    try {
      await updateBudgetItem({ data: { id, ...updates } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update item')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteBudgetItem({ data: { id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleSync = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item?.accounting_date) return
    try {
      await syncBudgetItem({ data: { id, accounting_date: item.accounting_date } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to sync')
    }
  }

  const handleUnsync = async (id: string) => {
    try {
      await unsyncBudgetItem({ data: { id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to unsync')
    }
  }

  const handleUpdateAnnual = async () => {
    const cents = parseDollarsTocents(annualDraft)
    if (cents === null || cents <= 0) return
    await updateBudget({ data: { id: budget.id, annual_amount_cents: cents } })
    setEditingAnnual(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/finances/budgets"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: budgetColor }} />
          <h1 className="text-2xl font-bold">{budget.name}</h1>
          <span className="text-lg text-gray-500">{budget.year}</span>
        </div>
      </div>

      {/* Summary bar */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-gray-500">
              Annual:{' '}
              {editingAnnual ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={annualDraft}
                    onChange={(e) => setAnnualDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateAnnual()
                      if (e.key === 'Escape') setEditingAnnual(false)
                    }}
                    onBlur={handleUpdateAnnual}
                    autoFocus
                    className="w-24 rounded border border-gray-300 px-1 py-0.5 text-sm"
                    inputMode="decimal"
                  />
                </span>
              ) : (
                <span
                  className="cursor-pointer font-medium text-gray-900 hover:underline"
                  onClick={() => {
                    setAnnualDraft((annualCents / 100).toFixed(2))
                    setEditingAnnual(true)
                  }}
                >
                  {formatCents(annualCents)}
                </span>
              )}
            </span>
            <span className="text-gray-500">
              Spent: <span className="font-medium text-gray-900">{formatCents(spentCents)}</span>
            </span>
            <span className="text-gray-500">
              Remaining:{' '}
              <span className={`font-medium ${remainingCents < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {formatCents(remainingCents)}
              </span>
            </span>
          </div>
          <span className="text-gray-400">{pct.toFixed(0)}% used</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: budgetColor }}
          />
        </div>
      </div>

      {/* Items table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
          <div className="min-w-[200px] flex-1 px-3 py-2">Description</div>
          <div className="w-[110px] shrink-0 px-3 py-2">Date</div>
          <div className="w-[110px] shrink-0 px-3 py-2 text-right">Soles</div>
          <div className="w-[110px] shrink-0 px-3 py-2 text-right">USD</div>
          <div className="w-[110px] shrink-0 px-3 py-2">Acct. Date</div>
          <div className="w-[80px] shrink-0 px-3 py-2 text-center">Status</div>
          <div className="w-[56px] shrink-0" />
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No items yet. Add your first expense.
          </div>
        ) : (
          items.map((item: BudgetItem) => {
            const isFrozen = item.movement_id
              ? frozenMovementIds.has(item.movement_id)
              : false
            return (
              <BudgetItemRow
                key={item.id}
                item={item}
                frozen={isFrozen}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onSync={() => handleSync(item.id)}
                onUnsync={() => handleUnsync(item.id)}
              />
            )
          })
        )}
      </div>

      {/* Add item form */}
      {showAddForm ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-700">New Item</h3>
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Description</label>
              <input
                type="text"
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                className="w-48 rounded border border-gray-300 px-2 py-1.5 text-sm"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Date</label>
              <DateInput
                value={addDate}
                onChange={setAddDate}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Soles (optional)</label>
              <input
                type="text"
                placeholder="185.38"
                value={addLocalCents}
                onChange={(e) => setAddLocalCents(e.target.value)}
                inputMode="decimal"
                className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">USD</label>
              <input
                type="text"
                placeholder="55.42"
                value={addAmountCents}
                onChange={(e) => setAddAmountCents(e.target.value)}
                inputMode="decimal"
                className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={handleAdd}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 self-start rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          <Plus size={16} />
          Add Item
        </button>
      )}

    </div>
  )
}
