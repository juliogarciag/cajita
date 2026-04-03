import { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { Plus, History, Lock, Unlock, ExternalLink } from 'lucide-react'
import { ConfirmButton } from './ConfirmButton.js'
import { RowActionsMenu } from './RowActionsMenu.js'
import { Tooltip } from './Tooltip.js'
import { movementsCollection, type Movement } from '#/lib/movements-collection.js'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'
import { checkpointsCollection } from '#/lib/checkpoints-collection.js'
import { budgetItemsCollection } from '#/lib/budget-items-collection.js'
import { budgetsCollection } from '#/lib/budgets-collection.js'
import { formatCents, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { useCheckpointBoundary } from '#/lib/use-checkpoint-boundary.js'
import { createCheckpoint, deleteCheckpoint } from '#/server/checkpoints.js'
import { EditableCell } from './EditableCell.js'
import { SnapshotPanel } from './SnapshotPanel.js'
import { CheckpointPopover } from './CheckpointPopover.js'
import { TableRow, ROW_HEIGHT } from './TableRow.js'

interface MovementWithTotal extends Movement {
  total_cents: number
  category_name: string | null
  category_color: string | null
  frozen: boolean
}

interface MovementsTableProps {
  highlightId?: string
}

export function MovementsTable({ highlightId }: MovementsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [checkpointRowId, setCheckpointRowId] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const scrollToEnd = useRef(false)
  const initialScroll = useRef(true)

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

  // Compute month/year boundary dividers
  const monthDividers = useMemo(() => {
    if (withTotals.length === 0) return []
    const dividers: { afterIndex: number; label: string; isYearBoundary: boolean; height: number }[] = []
    let prevMonth = withTotals[0].date.slice(0, 7)
    let prevYear = withTotals[0].date.slice(0, 4)
    for (let i = 1; i < withTotals.length; i++) {
      const curMonth = withTotals[i].date.slice(0, 7)
      const curYear = withTotals[i].date.slice(0, 4)
      if (curMonth !== prevMonth) {
        const isYearBoundary = curYear !== prevYear
        const [y, m] = curMonth.split('-')
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', {
          month: 'long',
          year: 'numeric',
        })
        dividers.push({ afterIndex: i - 1, label, isYearBoundary, height: isYearBoundary ? 28 : 24 })
        prevMonth = curMonth
        prevYear = curYear
      }
    }
    return dividers
  }, [withTotals])

  // Cumulative per-row offsets from month dividers
  const { rowOffsets, totalMonthDividerHeight } = useMemo(() => {
    const offsets = new Array(withTotals.length).fill(0)
    let cumulative = 0
    for (const d of monthDividers) {
      cumulative += d.height
      for (let i = d.afterIndex + 1; i < withTotals.length; i++) {
        offsets[i] = cumulative
      }
    }
    return { rowOffsets: offsets, totalMonthDividerHeight: cumulative }
  }, [withTotals, monthDividers])

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
  }, [activeCheckpoint])

  const rowCells = (row: MovementWithTotal) => {
    const isPositive = row.amount_cents > 0
    const frozen = row.frozen
    const budgetManaged = row.source !== 'manual' && movementToBudgetId.has(row.id)
    const disabled = frozen || budgetManaged
    return (
      <>
        <div className="w-[22px] shrink-0 flex items-center pl-[10px]">
          {frozen
            ? <Lock size={10} className="text-indigo-400" />
            : budgetManaged
            ? <Lock size={10} className="text-cyan-500" />
            : <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />}
        </div>
        <div className="min-w-[260px] flex-1 pr-1" data-cell="description">
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
        <div className="w-[160px] shrink-0 flex items-center">
          <EditableCell
            value={row.category_name ?? ''}
            type="category"
            categoryId={row.category_id}
            categoryColor={row.category_color}
            disabled={disabled}
            onSave={(v) => handleUpdate(row.id, 'category_id', v)}
          />
        </div>
        <div className="w-[80px] shrink-0 flex items-center justify-end gap-1 pr-2">
          {movementToBudgetId.has(row.id) && (
            <Tooltip content="View budget">
              <Link
                to="/finances/budgets/$budgetId"
                params={{ budgetId: movementToBudgetId.get(row.id)! }}
                search={{ highlight: row.id }}
                tabIndex={-1}
                className="rounded p-1 text-cyan-400 hover:bg-cyan-50 hover:text-cyan-600"
              >
                <ExternalLink size={12} />
              </Link>
            </Tooltip>
          )}
          {!frozen && (
            <RowActionsMenu
              onCheckpoint={() => setCheckpointRowId(row.id)}
              onDelete={budgetManaged ? undefined : () => handleDelete(row.id)}
            />
          )}
        </div>
      </>
    )
  }

  const renderRow = (row: MovementWithTotal, virtualStart: number, virtualSize: number) => {
    const budgetManaged = row.source !== 'manual' && movementToBudgetId.has(row.id)
    return (
    <TableRow
      key={row.id}
      frozen={row.frozen || budgetManaged}
      highlight={highlightedId === row.id}
      className={`w-full transition-colors duration-1000 ${row.source === 'budget_remaining' ? 'italic text-gray-400' : ''}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: virtualSize,
        transform: `translateY(${virtualStart}px)`,
      }}
      data-row-id={row.id}
    >
      {rowCells(row)}
    </TableRow>
  )}

  // Extra height for the checkpoint divider row
  const dividerHeight = activeCheckpoint && lastFrozenIndex >= 0 ? 32 : 0

  // Month dividers rendered as absolutely positioned overlays
  const monthDividersJSX = useMemo(() => {
    let cumulative = 0
    return monthDividers.map((d) => {
      const checkpointContribution =
        dividerHeight > 0 && lastFrozenIndex >= 0 && d.afterIndex >= lastFrozenIndex ? dividerHeight : 0
      const y = (d.afterIndex + 1) * ROW_HEIGHT + cumulative + checkpointContribution
      cumulative += d.height
      return (
        <div
          key={`month-${d.afterIndex}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${d.height}px`,
            transform: `translateY(${y}px)`,
            zIndex: 5,
          }}
          className={
            d.isYearBoundary
              ? 'flex items-center border-y border-gray-300 bg-gray-100 px-3 text-xs font-semibold text-gray-600'
              : 'flex items-center border-b border-gray-100 bg-gray-50 px-3 text-xs text-gray-400'
          }
        >
          {d.label}
        </div>
      )
    })
  }, [monthDividers, dividerHeight, lastFrozenIndex])

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
          transform: `translateY(${(lastFrozenIndex + 1) * ROW_HEIGHT + (rowOffsets[lastFrozenIndex + 1] ?? 0)}px)`,
          zIndex: 10,
        }}
        className="flex items-center border-b-2 border-indigo-200 bg-indigo-50 px-3 text-xs"
      >
        <div className="flex items-center gap-1.5 font-medium text-indigo-700">
          <Lock size={12} />
          Checkpointed
        </div>
        <div className="ml-4 text-indigo-600">
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
          <ConfirmButton
            onConfirm={handleUnfreeze}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-indigo-600 hover:bg-indigo-100"
            confirmClassName="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            <Unlock size={12} />
            Unfreeze
          </ConfirmButton>
        </div>
      </div>
    ) : null

  const tableContent = (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" data-editable-table>
      {/* Header */}
      <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
        <div className="w-[22px] shrink-0" />
        <div className="min-w-[260px] flex-1 px-3 py-2">Description</div>
        <div className="w-[120px] shrink-0 px-3 py-2">Date</div>
        <div className="w-[120px] shrink-0 px-3 py-2 text-right">Amount</div>
        <div className="w-[120px] shrink-0 px-3 py-2 text-right">Total</div>
        <div className="w-[160px] shrink-0 px-3 py-2">Category</div>
        <div className="w-[80px] shrink-0" />
      </div>

      {/* Virtualized body */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: Math.min(withTotals.length * ROW_HEIGHT + dividerHeight + totalMonthDividerHeight, window.innerHeight - 260) }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize() + dividerHeight + totalMonthDividerHeight}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = withTotals[virtualRow.index]
            const checkpointOffset =
              dividerHeight > 0 && virtualRow.index > lastFrozenIndex ? dividerHeight : 0
            const monthOffset = rowOffsets[virtualRow.index] ?? 0
            return renderRow(row, virtualRow.start + checkpointOffset + monthOffset, virtualRow.size)
          })}
          {monthDividersJSX}
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
