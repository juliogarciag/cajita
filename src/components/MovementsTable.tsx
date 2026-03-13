import { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { Plus, Trash2, History, Lock, Unlock, Wallet, ExternalLink } from 'lucide-react'
import { movementsCollection, type Movement } from '#/lib/movements-collection.js'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'
import { checkpointsCollection } from '#/lib/checkpoints-collection.js'
import { budgetItemsCollection } from '#/lib/budget-items-collection.js'
import { budgetsCollection } from '#/lib/budgets-collection.js'
import { formatCents, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { useClickAwayDismiss } from '#/lib/use-click-away-dismiss.js'
import { useCheckpointBoundary } from '#/lib/use-checkpoint-boundary.js'
import { createCheckpoint, deleteCheckpoint } from '#/server/checkpoints.js'
import { EditableCell } from './EditableCell.js'
import { SnapshotPanel } from './SnapshotPanel.js'
import { CheckpointPopover } from './CheckpointPopover.js'

interface MovementWithTotal extends Movement {
  total_cents: number
  category_name: string | null
  category_color: string | null
  frozen: boolean
}

const ROW_HEIGHT = 40

interface MovementsTableProps {
  highlightId?: string
}

export function MovementsTable({ highlightId }: MovementsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [checkpointRowId, setCheckpointRowId] = useState<string | null>(null)
  const [unfreezing, setUnfreezing] = useState(false)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const scrollToEnd = useRef(false)
  const initialScroll = useRef(true)

  useClickAwayDismiss(!!deletingId, useCallback(() => setDeletingId(null), []))

  const { data: movements } = useLiveQuery((q) =>
    q
      .from({ m: movementsCollection })
      .orderBy(({ m }) => m.date, 'asc')
      .orderBy(({ m }) => m.sort_position, 'asc'),
  )

  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }).orderBy(({ c }) => c.sort_order, 'asc'),
  )

  const { data: checkpoints } = useLiveQuery((q) =>
    q.from({ c: checkpointsCollection }).orderBy(({ c }) => c.created_at, 'desc'),
  )

  const { data: budgetItems } = useLiveQuery((q) =>
    q.from({ bi: budgetItemsCollection }),
  )

  const { data: budgets } = useLiveQuery((q) =>
    q.from({ b: budgetsCollection }),
  )

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    for (const cat of categories) {
      map.set(cat.id, cat)
    }
    return map
  }, [categories])

  // Map movement IDs to their budget IDs (for synced budget items and remaining movements)
  const movementToBudgetId = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of budgetItems) {
      if (item.movement_id) map.set(item.movement_id, item.budget_id)
    }
    for (const b of budgets) {
      if (b.remaining_movement_id) map.set(b.remaining_movement_id, b.id)
    }
    return map
  }, [budgetItems, budgets])

  const { activeCheckpoint, boundary: checkpointBoundary } = useCheckpointBoundary(checkpoints, movements)

  // Compute running totals and frozen state
  const allWithTotals: MovementWithTotal[] = useMemo(() => {
    let runningTotal = 0
    return movements.map((m: Movement) => {
      runningTotal += m.amount_cents
      const cat = m.category_id ? categoryMap.get(m.category_id) : null
      const frozen = checkpointBoundary
        ? m.date < checkpointBoundary.date ||
          (m.date === checkpointBoundary.date &&
            m.sort_position <= checkpointBoundary.sort_position)
        : false
      return {
        ...m,
        total_cents: runningTotal,
        category_name: cat?.name ?? null,
        category_color: cat?.color ?? null,
        frozen,
      }
    })
  }, [movements, categoryMap, checkpointBoundary])

  const withTotals = allWithTotals

  // Find the index of the last frozen row (for divider placement)
  const lastFrozenIndex = useMemo(() => {
    for (let i = withTotals.length - 1; i >= 0; i--) {
      if (withTotals[i].frozen) return i
    }
    return -1
  }, [withTotals])

  const virtualizer = useVirtualizer({
    count: withTotals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  // Scroll to highlighted row or bottom on initial load
  useEffect(() => {
    if (withTotals.length === 0) return
    if (initialScroll.current) {
      initialScroll.current = false
      if (highlightId) {
        const idx = withTotals.findIndex((m) => m.id === highlightId)
        if (idx >= 0) {
          setTimeout(() => {
            virtualizer.scrollToIndex(idx, { align: 'center' })
            setHighlightedId(highlightId)
            setTimeout(() => setHighlightedId(null), 2000)
          }, 200)
          return
        }
      }
      setTimeout(() => {
        parentRef.current?.scrollTo({ top: parentRef.current.scrollHeight })
      }, 200)
    } else if (scrollToEnd.current) {
      scrollToEnd.current = false
      setTimeout(() => {
        parentRef.current?.scrollTo({ top: parentRef.current.scrollHeight })
      }, 200)
    }
  }, [withTotals, highlightId, virtualizer])

  const handleUpdate = useCallback((id: string, field: keyof Movement, rawValue: string) => {
    const updates: Partial<Movement> = {}

    if (field === 'amount_cents') {
      const cents = parseDollarsTocents(rawValue)
      if (cents === null) return
      updates.amount_cents = cents
    } else if (field === 'category_id') {
      updates.category_id = rawValue || null
    } else {
      ;(updates as Record<string, string>)[field] = rawValue
    }

    movementsCollection.update(id, (draft) => {
      Object.assign(draft, updates)
    })
  }, [])

  const handleAdd = useCallback(() => {
    const today = toISODate(new Date())
    let maxPos = movements.reduce(
      (max: number, m: Movement) => (m.date === today ? Math.max(max, m.sort_position) : max),
      0,
    )

    // Ensure new movement is after checkpoint if same date
    if (checkpointBoundary && checkpointBoundary.date === today) {
      maxPos = Math.max(maxPos, checkpointBoundary.sort_position)
    }

    movementsCollection.insert({
      id: crypto.randomUUID(),
      description: '',
      date: today,
      amount_cents: 0,
      category_id: null,
      sort_position: maxPos + 1000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    scrollToEnd.current = true
  }, [movements, checkpointBoundary])

  const handleDelete = useCallback((id: string) => {
    movementsCollection.delete(id)
    setDeletingId(null)
  }, [])

  const handleCreateCheckpoint = useCallback(
    async (movementId: string, actualCents: number) => {
      await createCheckpoint({ data: { movement_id: movementId, actual_cents: actualCents } })
      setCheckpointRowId(null)
    },
    [],
  )

  const handleUnfreeze = useCallback(async () => {
    if (!activeCheckpoint) return
    await deleteCheckpoint({ data: { id: activeCheckpoint.id } })
    setUnfreezing(false)
  }, [activeCheckpoint])

  const rowCells = (row: MovementWithTotal) => {
    const isPositive = row.amount_cents > 0
    const frozen = row.frozen
    const budgetManaged = row.source !== 'manual' && movementToBudgetId.has(row.id)
    const disabled = frozen || budgetManaged
    return (
      <>
        <div className="w-[260px] shrink-0 px-1" data-cell="description">
          <EditableCell
            value={row.description}
            type="text"
            disabled={disabled}
            onSave={(v) => handleUpdate(row.id, 'description', v)}
          />
        </div>
        <div className="w-[120px] shrink-0 px-1">
          <EditableCell
            value={row.date}
            type="date"
            disabled={disabled}
            onSave={(v) => handleUpdate(row.id, 'date', v)}
          />
        </div>
        <div className="w-[120px] shrink-0 px-1">
          <EditableCell
            value={formatCents(row.amount_cents)}
            type="amount"
            disabled={disabled}
            className={`text-right ${isPositive ? 'text-green-700' : 'text-red-700'}`}
            onSave={(v) => handleUpdate(row.id, 'amount_cents', v)}
          />
        </div>
        <div className="w-[120px] shrink-0 px-3 py-1 text-right font-medium">
          {formatCents(row.total_cents)}
        </div>
        <div className="flex-1 px-1">
          <EditableCell
            value={row.category_name ?? ''}
            type="category"
            categoryId={row.category_id}
            disabled={disabled}
            onSave={(v) => handleUpdate(row.id, 'category_id', v)}
          />
        </div>
        <div className="w-[48px] shrink-0 flex items-center justify-center">
          {frozen ? (
            <Lock size={14} className="text-gray-300" />
          ) : budgetManaged ? (
            <div className="flex items-center gap-0.5">
              <span title={`Managed by budget (${row.source})`}>
                <Wallet size={14} className="text-blue-400" />
              </span>
              {movementToBudgetId.has(row.id) && (
                <Link
                  to="/finances/budgets/$budgetId"
                  params={{ budgetId: movementToBudgetId.get(row.id)! }}
                  className="rounded p-1 text-gray-300 hover:bg-blue-50 hover:text-blue-600"
                  title="View budget"
                >
                  <ExternalLink size={12} />
                </Link>
              )}
              <button
                onClick={() => setCheckpointRowId(row.id)}
                className="rounded p-1 text-gray-300 hover:bg-amber-50 hover:text-amber-600"
                title="Reconcile up to here"
              >
                <Lock size={14} />
              </button>
            </div>
          ) : deletingId === row.id ? (
            <button
              data-confirm-delete
              onClick={() => handleDelete(row.id)}
              className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Yes
            </button>
          ) : (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCheckpointRowId(row.id)}
                className="rounded p-1 text-gray-300 hover:bg-amber-50 hover:text-amber-600"
                title="Reconcile up to here"
              >
                <Lock size={14} />
              </button>
              <button
                data-confirm-delete
                onClick={() => setDeletingId(row.id)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </>
    )
  }

  const renderRow = (row: MovementWithTotal, virtualStart: number, virtualSize: number) => (
    <div
      key={row.id}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${virtualSize}px`,
        transform: `translateY(${virtualStart}px)`,
      }}
      className={`flex w-full items-center border-b border-gray-100 text-sm transition-colors duration-1000 ${
        highlightedId === row.id ? 'bg-blue-100' : row.frozen ? 'opacity-50' : 'hover:bg-gray-50'
      } ${row.source === 'budget_remaining' ? 'italic text-gray-400' : ''}`}
      data-row-id={row.id}
    >
      {rowCells(row)}
    </div>
  )

  // Checkpoint divider positioned after last frozen row
  const checkpointDivider =
    activeCheckpoint && lastFrozenIndex >= 0 ? (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '32px',
          transform: `translateY(${(lastFrozenIndex + 1) * ROW_HEIGHT}px)`,
          zIndex: 10,
        }}
        className="flex items-center border-b-2 border-amber-300 bg-amber-50 px-3 text-xs"
      >
        <div className="flex items-center gap-1.5 font-medium text-amber-700">
          <Lock size={12} />
          Reconciled
        </div>
        <div className="ml-4 text-amber-600">
          Expected: {formatCents(activeCheckpoint.expected_cents)} | Actual:{' '}
          {formatCents(activeCheckpoint.actual_cents)} | Diff:{' '}
          <span
            className={
              activeCheckpoint.actual_cents - activeCheckpoint.expected_cents === 0
                ? 'text-green-600'
                : 'text-red-600'
            }
          >
            {formatCents(activeCheckpoint.actual_cents - activeCheckpoint.expected_cents)}
          </span>
        </div>
        <div className="ml-auto">
          {unfreezing ? (
            <div className="flex items-center gap-2">
              <span className="text-amber-700">
                Unlock {lastFrozenIndex + 1} movements?
              </span>
              <button
                onClick={handleUnfreeze}
                className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Yes
              </button>
              <button
                onClick={() => setUnfreezing(false)}
                className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setUnfreezing(true)}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-amber-600 hover:bg-amber-100"
            >
              <Unlock size={12} />
              Unfreeze
            </button>
          )}
        </div>
      </div>
    ) : null

  // Extra height for the divider row
  const dividerHeight = activeCheckpoint && lastFrozenIndex >= 0 ? 32 : 0

  const tableContent = (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
        <div className="w-[260px] shrink-0 px-3 py-2">Description</div>
        <div className="w-[120px] shrink-0 px-3 py-2">Date</div>
        <div className="w-[120px] shrink-0 px-3 py-2 text-right">Amount</div>
        <div className="w-[120px] shrink-0 px-3 py-2 text-right">Total</div>
        <div className="flex-1 px-3 py-2">Category</div>
        <div className="w-[48px] shrink-0" />
      </div>

      {/* Virtualized body */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: Math.min(withTotals.length * ROW_HEIGHT + dividerHeight, window.innerHeight - 260) }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize() + dividerHeight}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = withTotals[virtualRow.index]
            // Offset rows after the divider
            const offset =
              dividerHeight > 0 && virtualRow.index > lastFrozenIndex ? dividerHeight : 0
            return renderRow(row, virtualRow.start + offset, virtualRow.size)
          })}
          {checkpointDivider}
        </div>
      </div>
    </div>
  )

  // Find the row for the checkpoint popover
  const checkpointRow = checkpointRowId
    ? withTotals.find((m) => m.id === checkpointRowId)
    : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold">Movements</h1>
            {withTotals.length > 0 && (
              <span className={`text-lg font-semibold ${withTotals[withTotals.length - 1].total_cents >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCents(withTotals[withTotals.length - 1].total_cents)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSnapshotOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <History size={16} />
              Snapshots
            </button>
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Plus size={16} />
              Add Movement
            </button>
          </div>
        </div>
      </div>

      {withTotals.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-gray-500">No movements yet. Add your first one.</p>
        </div>
      ) : (
        tableContent
      )}

      {checkpointRow && (
        <CheckpointPopover
          expectedCents={checkpointRow.total_cents}
          onConfirm={(actualCents) => handleCreateCheckpoint(checkpointRow.id, actualCents)}
          onClose={() => setCheckpointRowId(null)}
        />
      )}

      <SnapshotPanel open={snapshotOpen} onClose={() => setSnapshotOpen(false)} />
    </div>
  )
}
