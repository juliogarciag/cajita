import { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { Plus, History, Lock, Unlock, ExternalLink, Clock, CheckCircle } from 'lucide-react'
import { ConfirmButton } from './ConfirmButton.js'
import { RowActionsMenu } from './RowActionsMenu.js'
import { Tooltip } from './Tooltip.js'
import { movementsCollection, type Movement } from '#/lib/movements-collection.js'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'
import { checkpointsCollection } from '#/lib/checkpoints-collection.js'
import { budgetItemsCollection } from '#/lib/budget-items-collection.js'
import { budgetsCollection } from '#/lib/budgets-collection.js'
import { movementNotesCollection } from '#/lib/movement-notes-collection.js'
import { budgetItemNotesCollection } from '#/lib/budget-item-notes-collection.js'
import type { TeamMember } from '#/lib/team-members-collection.js'
import { formatCents, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { useCheckpointBoundary } from '#/lib/use-checkpoint-boundary.js'
import { createCheckpoint, deleteCheckpoint } from '#/server/checkpoints.js'
import { upsertMovementNote, deleteMovementNote, upsertBudgetItemNote, deleteBudgetItemNote, getTeamMembers } from '#/server/notes.js'
import { confirmRecurringMovement } from '#/server/recurring-movements.js'
import { EditableCell } from './EditableCell.js'
import { SnapshotPanel } from './SnapshotPanel.js'
import { CheckpointPopover } from './CheckpointPopover.js'
import { NotePopover, NoteIconButton } from './NotePopover.js'
import { TableRow, ROW_HEIGHT } from './TableRow.js'

interface MovementWithTotal extends Movement {
  total_cents: number
  category_name: string | null
  category_color: string | null
  frozen: boolean
}

const TODAY = new Date().toISOString().slice(0, 10)

interface MovementsTableProps {
  highlightId?: string
}

export function MovementsTable({ highlightId }: MovementsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [checkpointRowId, setCheckpointRowId] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null)
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

  const { data: movementNotes } = useLiveQuery((q) =>
    q.from({ n: movementNotesCollection }),
  )

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  useEffect(() => {
    getTeamMembers().then(setTeamMembers).catch(() => {})
  }, [])

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    for (const cat of categories) {
      map.set(cat.id, cat)
    }
    return map
  }, [categories])

  const { data: budgetItemNotes } = useLiveQuery((q) =>
    q.from({ n: budgetItemNotesCollection }),
  )

  // Map movement IDs to their notes
  const movementNoteMap = useMemo(() => {
    const map = new Map<string, (typeof movementNotes)[0]>()
    for (const note of movementNotes) {
      map.set(note.movement_id, note)
    }
    return map
  }, [movementNotes])

  // Map budget item IDs to their notes
  const budgetItemNoteMap = useMemo(() => {
    const map = new Map<string, (typeof budgetItemNotes)[0]>()
    for (const note of budgetItemNotes) {
      map.set(note.budget_item_id, note)
    }
    return map
  }, [budgetItemNotes])

  // Map movement IDs to their budget item IDs (for synced movements)
  const movementToBudgetItemId = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of budgetItems) {
      if (item.movement_id) map.set(item.movement_id, item.id)
    }
    return map
  }, [budgetItems])

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

  // Current balance: sum of confirmed movements with date <= today
  const currentBalance = useMemo(() => {
    return movements
      .filter((m: Movement) => m.date <= TODAY && (m.confirmed !== false || m.source !== 'recurring'))
      .reduce((sum: number, m: Movement) => sum + m.amount_cents, 0)
  }, [movements])

  // Projected year-end: sum of all movements through Dec 31 of current year
  const currentYear = new Date().getFullYear()
  const yearEnd = `${currentYear}-12-31`
  const projectedYearEnd = useMemo(() => {
    return movements
      .filter((m: Movement) => m.date <= yearEnd)
      .reduce((sum: number, m: Movement) => sum + m.amount_cents, 0)
  }, [movements, yearEnd])

  // Merge rows, month dividers, and today-divider into a single flat list for the virtualizer
  type TableItem =
    | { type: 'row'; data: MovementWithTotal }
    | { type: 'month-divider'; label: string; isYearBoundary: boolean; height: number }
    | { type: 'today-divider'; height: number }

  const tableItems = useMemo((): TableItem[] => {
    if (withTotals.length === 0) return []
    const result: TableItem[] = []
    let prevMonth = ''
    let prevYear = ''
    let todayDividerInserted = false

    for (let i = 0; i < withTotals.length; i++) {
      const row = withTotals[i]
      const curMonth = row.date.slice(0, 7)
      const curYear = row.date.slice(0, 4)

      // Insert today-divider before the first row with date > today
      if (!todayDividerInserted && row.date > TODAY) {
        todayDividerInserted = true
        result.push({ type: 'today-divider', height: 32 })
      }

      if (i > 0 && curMonth !== prevMonth) {
        const isYearBoundary = curYear !== prevYear
        const [y, m] = curMonth.split('-')
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', {
          month: 'long',
          year: 'numeric',
        })
        result.push({ type: 'month-divider', label, isYearBoundary, height: isYearBoundary ? 32 : 28 })
      }
      result.push({ type: 'row', data: row })
      prevMonth = curMonth
      prevYear = curYear
    }
    return result
  }, [withTotals])

  // Find the index of the last frozen row in tableItems (for checkpoint divider placement)
  const lastFrozenIndex = useMemo(() => {
    for (let i = tableItems.length - 1; i >= 0; i--) {
      const item = tableItems[i]
      if (item.type === 'row' && item.data.frozen) return i
    }
    return -1
  }, [tableItems])

  const virtualizer = useVirtualizer({
    count: tableItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = tableItems[index]
      if (item.type === 'month-divider') return item.height
      if (item.type === 'today-divider') return item.height
      return ROW_HEIGHT
    },
    overscan: 20,
  })

  // Scroll to highlighted row or bottom on initial load
  useEffect(() => {
    if (withTotals.length === 0) return
    if (initialScroll.current) {
      initialScroll.current = false
      if (highlightId) {
        const idx = tableItems.findIndex((item) => item.type === 'row' && item.data.id === highlightId)
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

  const handleConfirmRecurring = useCallback(async (id: string) => {
    await confirmRecurringMovement({ data: { movementId: id } })
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
    const budgetManaged = (row.source === 'budget_sync' || row.source === 'budget_remaining') && movementToBudgetId.has(row.id)
    const isUnconfirmedRecurring = row.source === 'recurring' && !row.confirmed
    const isFutureUnconfirmedRecurring = isUnconfirmedRecurring && row.date > TODAY
    const disabled = frozen || budgetManaged
    return (
      <>
        <div className="w-[22px] shrink-0 flex items-center pl-[10px]">
          {frozen
            ? <Lock size={10} className="text-indigo-400" />
            : budgetManaged
            ? <Lock size={10} className="text-cyan-500" />
            : isUnconfirmedRecurring
            ? <Clock size={10} className="text-amber-400" />
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
        <div className="w-[100px] shrink-0 flex items-center justify-end gap-1 pr-2">
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
          {(() => {
            const budgetItemId = movementToBudgetItemId.get(row.id)
            const note = budgetItemId
              ? (budgetItemNoteMap.get(budgetItemId) ?? null)
              : (movementNoteMap.get(row.id) ?? null)
            const onSave = budgetItemId
              ? (content: string) => upsertBudgetItemNote({ data: { budget_item_id: budgetItemId, content } })
              : (content: string) => upsertMovementNote({ data: { movement_id: row.id, content } })
            const onDelete = budgetItemId
              ? () => deleteBudgetItemNote({ data: { budget_item_id: budgetItemId } })
              : () => deleteMovementNote({ data: { movement_id: row.id } })
            return (
              <NoteIconButton
                hasNote={note !== null}
                open={noteOpenId === row.id}
                onOpenChange={(open) => setNoteOpenId(open ? row.id : null)}
              >
                {noteOpenId === row.id && (
                  <NotePopover
                    note={note}
                    onOpenChange={(open) => setNoteOpenId(open ? row.id : null)}
                    teamMembers={teamMembers}
                    onSave={onSave}
                    onDelete={onDelete}
                  />
                )}
              </NoteIconButton>
            )
          })()}
          {isUnconfirmedRecurring && !isFutureUnconfirmedRecurring && (
            <Tooltip content="Confirm this movement">
              <button
                onClick={() => handleConfirmRecurring(row.id)}
                className="rounded p-1 text-amber-500 hover:bg-amber-50 hover:text-amber-700"
              >
                <CheckCircle size={12} />
              </button>
            </Tooltip>
          )}
          {!frozen && (
            <RowActionsMenu
              onCheckpoint={() => setCheckpointRowId(row.id)}
              onDelete={budgetManaged || isFutureUnconfirmedRecurring ? undefined : () => handleDelete(row.id)}
            />
          )}
        </div>
      </>
    )
  }

  const renderRow = (row: MovementWithTotal, virtualStart: number, virtualSize: number) => {
    const budgetManaged = (row.source === 'budget_sync' || row.source === 'budget_remaining') && movementToBudgetId.has(row.id)
    const isUnconfirmedRecurring = row.source === 'recurring' && !row.confirmed
    const rowClassName = [
      'w-full transition-colors duration-1000',
      row.source === 'budget_remaining' ? 'italic text-gray-400' : '',
      isUnconfirmedRecurring ? 'italic text-gray-500 bg-amber-50/40' : '',
    ].filter(Boolean).join(' ')
    return (
    <TableRow
      key={row.id}
      frozen={row.frozen || budgetManaged}
      highlight={highlightedId === row.id}
      className={rowClassName}
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

  // Compute checkpoint Y position by summing estimated sizes of all items above it
  const checkpointY = useMemo(() => {
    if (lastFrozenIndex < 0) return 0
    let y = 0
    for (let i = 0; i <= lastFrozenIndex; i++) {
      const item = tableItems[i]
      y += item.type === 'row' ? ROW_HEIGHT : item.height
    }
    return y
  }, [tableItems, lastFrozenIndex])

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
          transform: `translateY(${checkpointY}px)`,
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
        <div className="w-[100px] shrink-0" />
      </div>

      {/* Virtualized body */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: Math.min(virtualizer.getTotalSize() + dividerHeight, window.innerHeight - 260) }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize() + dividerHeight}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = tableItems[virtualRow.index]
            const checkpointOffset =
              dividerHeight > 0 && virtualRow.index > lastFrozenIndex ? dividerHeight : 0
            const top = virtualRow.start + checkpointOffset

            if (item.type === 'today-divider') {
              return (
                <div
                  key={`today-divider-${virtualRow.index}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${item.height}px`,
                    transform: `translateY(${top}px)`,
                    zIndex: 5,
                  }}
                  className="flex items-center border-y-2 border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-700 gap-2"
                >
                  <Clock size={12} />
                  Today — projected below
                </div>
              )
            }

            if (item.type === 'month-divider') {
              return (
                <div
                  key={`divider-${virtualRow.index}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${item.height}px`,
                    transform: `translateY(${top}px)`,
                  }}
                  className={
                    item.isYearBoundary
                      ? 'flex items-center border-y-2 border-slate-400 bg-slate-200 px-3 text-xs font-bold text-slate-800 uppercase tracking-wide'
                      : 'flex items-center border-y border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-600'
                  }
                >
                  {item.label}
                </div>
              )
            }

            return renderRow(item.data, top, virtualRow.size)
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
          <div className="flex items-baseline gap-4">
            <h1 className="text-2xl font-bold">Movements</h1>
            {withTotals.length > 0 && (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Current</span>
                  <span className={`text-lg font-semibold ${currentBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCents(currentBalance)}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Year-end</span>
                  <span className={`text-base font-medium ${projectedYearEnd >= 0 ? 'text-green-600' : 'text-red-600'} opacity-70`}>
                    {formatCents(projectedYearEnd)}
                  </span>
                </div>
              </>
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
