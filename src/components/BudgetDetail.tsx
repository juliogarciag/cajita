import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { eq } from '@tanstack/db'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { budgetItemsCollection, type BudgetItem } from '#/lib/budget-items-collection.js'
import { budgetsCollection } from '#/lib/budgets-collection.js'
import { categoriesCollection } from '#/lib/categories-collection.js'
import { movementsCollection } from '#/lib/movements-collection.js'
import { checkpointsCollection } from '#/lib/checkpoints-collection.js'
import type { BudgetItemNote } from '#/lib/budget-item-notes-collection.js'
import type { TeamMember } from '#/lib/team-members-collection.js'
import { formatCents, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { useCheckpointBoundary } from '#/lib/use-checkpoint-boundary.js'
import {
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  syncBudgetItem,
  unsyncBudgetItem,
} from '#/server/budget-items.js'
import { upsertBudgetItemNote, deleteBudgetItemNote, getTeamMembers, getBudgetItemNotes } from '#/server/notes.js'
import { updateBudget } from '#/server/budgets.js'
import { BudgetItemRow } from './BudgetItemRow.js'
import { ROW_HEIGHT } from './TableRow.js'

export function BudgetDetail() {
  const { budgetId } = useParams({ strict: false }) as { budgetId: string }
  const { highlight } = useSearch({ strict: false }) as { highlight?: string }

  const [newItemId, setNewItemId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null)
  const scrolledRef = useRef(false)
  const tableBodyRef = useRef<HTMLDivElement>(null)
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
      .where(({ bi }) => eq(bi.budget_id, budgetId as typeof bi.budget_id))
      .orderBy(({ bi }) => bi.sort_position, 'asc'),
  )

  const { data: movements } = useLiveQuery((q) =>
    q.from({ m: movementsCollection }),
  )

  const { data: checkpoints } = useLiveQuery((q) =>
    q.from({ c: checkpointsCollection }).orderBy(({ c }) => c.created_at, 'desc'),
  )

  const [budgetItemNotes, setBudgetItemNotes] = useState<BudgetItemNote[]>([])
  const refreshBudgetItemNotes = useCallback(() => {
    getBudgetItemNotes().then((notes) => setBudgetItemNotes(notes as unknown as BudgetItemNote[])).catch(() => {})
  }, [])
  useEffect(() => {
    refreshBudgetItemNotes()
  }, [refreshBudgetItemNotes])

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  useEffect(() => {
    getTeamMembers().then(setTeamMembers).catch(() => {})
  }, [])

  const budgetItemNoteMap = useMemo(
    () => Object.fromEntries(budgetItemNotes.map((n) => [n.budget_item_id, n])),
    [budgetItemNotes],
  )

  const { frozenMovementIds } = useCheckpointBoundary(checkpoints, movements)

  useEffect(() => {
    if (!highlight || items.length === 0 || scrolledRef.current) return
    const item = items.find((i) => i.movement_id === highlight)
    if (!item) return
    scrolledRef.current = true
    setTimeout(() => {
      const el = document.getElementById(item.id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedItemId(item.id)
        setTimeout(() => setHighlightedItemId(null), 2000)
      }
    }, 100)
  }, [highlight, items])

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
    setIsAdding(true)
    try {
      const result = await createBudgetItem({
        data: {
          budget_id: budgetId,
          description: '',
          date: toISODate(new Date()),
          amount_cents: 0,
        },
      })
      setNewItemId(result.item.id)
      setTimeout(() => {
        if (tableBodyRef.current) {
          tableBodyRef.current.scrollTop = tableBodyRef.current.scrollHeight
        }
      }, 100)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add item')
    } finally {
      setIsAdding(false)
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
      <div className="flex items-center justify-between">
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
        <button
          onClick={handleAdd}
          disabled={isAdding}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          <Plus size={16} />
          {isAdding ? 'Adding…' : 'Add Item'}
        </button>
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
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" data-editable-table>
        <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
          <div className="w-[22px] shrink-0" />
          <div className="min-w-[200px] flex-1 px-3 py-2">Description</div>
          <div className="w-[110px] shrink-0 px-3 py-2">Date</div>
          <div className="w-[110px] shrink-0 px-3 py-2 text-right">Soles</div>
          <div className="w-[110px] shrink-0 px-3 py-2 text-right">USD</div>
          <div className="w-[110px] shrink-0 px-3 py-2">Acct. Date</div>
          <div className="w-[160px] shrink-0" />
        </div>

        <div
          ref={tableBodyRef}
          className="overflow-auto"
          style={{ height: Math.min(items.length * ROW_HEIGHT, window.innerHeight - 320) }}
        >
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
                  id={item.id}
                  item={item}
                  frozen={isFrozen}
                  highlight={highlightedItemId === item.id}
                  autoEditDescription={item.id === newItemId}
                  note={budgetItemNoteMap[item.id] ?? null}
                  noteOpen={noteOpenId === item.id}
                  teamMembers={teamMembers}
                  onNoteOpenChange={(open) => setNoteOpenId(open ? item.id : null)}
                  onNoteSave={async (content) => {
                    await upsertBudgetItemNote({ data: { budget_item_id: item.id, content } })
                    refreshBudgetItemNotes()
                  }}
                  onNoteDelete={async () => {
                    await deleteBudgetItemNote({ data: { budget_item_id: item.id } })
                    refreshBudgetItemNotes()
                  }}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onSync={() => handleSync(item.id)}
                  onUnsync={() => handleUnsync(item.id)}
                />
              )
            })
          )}
        </div>
      </div>


    </div>
  )
}
