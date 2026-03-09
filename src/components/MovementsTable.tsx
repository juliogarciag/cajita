import { useRef, useMemo, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLiveQuery } from '@tanstack/react-db'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Plus, Trash2, History, GripVertical } from 'lucide-react'
import { movementsCollection, type Movement } from '#/lib/movements-collection.js'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'
import { formatCents, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { EditableCell } from './EditableCell.js'
import { DateRangeFilter, type DateRange } from './DateRangeFilter.js'
import { CategoryFilter } from './CategoryFilter.js'
import { SnapshotPanel } from './SnapshotPanel.js'
import { DraggableRow, DroppableRow } from './DragRow.js'

const ROW_HEIGHT = 40

interface MovementWithTotal extends Movement {
  total_cents: number
  category_name: string | null
  category_color: string | null
}

export function MovementsTable() {
  const parentRef = useRef<HTMLDivElement>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDateRangeChange = useCallback((range: DateRange | null) => {
    setDateRange(range)
    if (range) setCategoryId(null)
  }, [])

  const handleCategoryChange = useCallback((id: string | null) => {
    setCategoryId(id)
    if (id) setDateRange(null)
  }, [])

  const { data: movements } = useLiveQuery((q) =>
    q
      .from({ m: movementsCollection })
      .orderBy(({ m }) => m.date, 'asc')
      .orderBy(({ m }) => m.sort_position, 'asc'),
  )

  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }).orderBy(({ c }) => c.sort_order, 'asc'),
  )

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    for (const cat of categories) {
      map.set(cat.id, cat)
    }
    return map
  }, [categories])

  // Compute running totals on ALL movements (absolute balance)
  const allWithTotals: MovementWithTotal[] = useMemo(() => {
    let runningTotal = 0
    return movements.map((m: Movement) => {
      runningTotal += m.amount_cents
      const cat = m.category_id ? categoryMap.get(m.category_id) : null
      return {
        ...m,
        total_cents: runningTotal,
        category_name: cat?.name ?? null,
        category_color: cat?.color ?? null,
      }
    })
  }, [movements, categoryMap])

  // Apply filters after totals are computed
  const isCategoryFilter = categoryId !== null
  const withTotals = useMemo(() => {
    if (dateRange) {
      return allWithTotals.filter((m) => m.date >= dateRange.from && m.date <= dateRange.to)
    }
    if (categoryId) {
      return allWithTotals.filter((m) => m.category_id === categoryId)
    }
    return allWithTotals
  }, [allWithTotals, dateRange, categoryId])

  const virtualizer = useVirtualizer({
    count: withTotals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const handleUpdate = useCallback(
    (id: string, field: keyof Movement, rawValue: string) => {
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
    },
    [],
  )

  const handleAdd = useCallback(() => {
    const today = toISODate(new Date())
    const maxPos = movements.reduce(
      (max: number, m: Movement) => (m.date === today ? Math.max(max, m.sort_position) : max),
      0,
    )

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
  }, [movements])

  const handleDelete = useCallback((id: string) => {
    movementsCollection.delete(id)
    setDeletingId(null)
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const activeRow = withTotals.find((m) => m.id === active.id)
      const overRow = withTotals.find((m) => m.id === over.id)
      if (!activeRow || !overRow) return

      // Only allow reorder within same date
      if (activeRow.date !== overRow.date) return

      // Get all rows for this date in current order
      const sameDateRows = withTotals.filter((m) => m.date === activeRow.date)
      const activeIdx = sameDateRows.findIndex((m) => m.id === active.id)
      const overIdx = sameDateRows.findIndex((m) => m.id === over.id)
      if (activeIdx === -1 || overIdx === -1) return

      // Calculate new sort_position
      let newPosition: number
      if (overIdx === 0 && activeIdx > overIdx) {
        // Moving to first position
        newPosition = sameDateRows[0].sort_position - 500
      } else if (overIdx === sameDateRows.length - 1 && activeIdx < overIdx) {
        // Moving to last position
        newPosition = sameDateRows[sameDateRows.length - 1].sort_position + 500
      } else if (activeIdx < overIdx) {
        // Moving down
        const after = sameDateRows[overIdx].sort_position
        const next =
          overIdx + 1 < sameDateRows.length
            ? sameDateRows[overIdx + 1].sort_position
            : after + 1000
        newPosition = Math.floor((after + next) / 2)
      } else {
        // Moving up
        const before = sameDateRows[overIdx].sort_position
        const prev = overIdx - 1 >= 0 ? sameDateRows[overIdx - 1].sort_position : before - 1000
        newPosition = Math.floor((prev + before) / 2)
      }

      movementsCollection.update(activeRow.id, (draft) => {
        draft.sort_position = newPosition
      })
    },
    [withTotals],
  )

  const activeRow = activeId ? withTotals.find((m) => m.id === activeId) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Movements</h1>
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
        <div className="flex items-center gap-3">
          <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
          <div className="h-4 w-px bg-gray-300" />
          <CategoryFilter value={categoryId} onChange={handleCategoryChange} />
        </div>
      </div>

      {withTotals.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-gray-500">
            {dateRange || categoryId
              ? 'No movements match the current filter.'
              : 'No movements yet. Add your first one.'}
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {/* Header */}
            <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
              <div className="w-[28px] shrink-0" />
              <div className="w-[260px] shrink-0 px-3 py-2">Description</div>
              <div className="w-[120px] shrink-0 px-3 py-2">Date</div>
              <div className="w-[120px] shrink-0 px-3 py-2 text-right">Amount</div>
              {!isCategoryFilter && (
                <div className="w-[120px] shrink-0 px-3 py-2 text-right">Total</div>
              )}
              <div className="flex-1 px-3 py-2">Category</div>
              <div className="w-[48px] shrink-0" />
            </div>

            {/* Virtualized body */}
            <div ref={parentRef} className="max-h-[calc(100vh-260px)] overflow-auto">
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = withTotals[virtualRow.index]
                  const isPositive = row.amount_cents > 0

                  return (
                    <DroppableRow
                      key={row.id}
                      id={row.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={`flex w-full items-center border-b border-gray-100 text-sm hover:bg-gray-50 ${
                        activeId && activeId !== row.id ? 'transition-colors' : ''
                      }`}
                    >
                      <DraggableRow id={row.id}>
                        <GripVertical size={14} className="text-gray-300" />
                      </DraggableRow>
                      <div className="w-[260px] shrink-0 px-1">
                        <EditableCell
                          value={row.description}
                          type="text"
                          onSave={(v) => handleUpdate(row.id, 'description', v)}
                        />
                      </div>
                      <div className="w-[120px] shrink-0 px-1">
                        <EditableCell
                          value={row.date}
                          type="date"
                          onSave={(v) => handleUpdate(row.id, 'date', v)}
                        />
                      </div>
                      <div className="w-[120px] shrink-0 px-1">
                        <EditableCell
                          value={formatCents(row.amount_cents)}
                          type="amount"
                          className={`text-right ${isPositive ? 'text-green-700' : 'text-red-700'}`}
                          onSave={(v) => handleUpdate(row.id, 'amount_cents', v)}
                        />
                      </div>
                      {!isCategoryFilter && (
                        <div className="w-[120px] shrink-0 px-3 py-1 text-right font-medium">
                          {formatCents(row.total_cents)}
                        </div>
                      )}
                      <div className="flex-1 px-1">
                        <EditableCell
                          value={row.category_name ?? ''}
                          type="category"
                          categoryId={row.category_id}
                          onSave={(v) => handleUpdate(row.id, 'category_id', v)}
                        />
                      </div>
                      <div className="w-[48px] shrink-0 flex items-center justify-center">
                        {deletingId === row.id ? (
                          <button
                            onClick={() => handleDelete(row.id)}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Yes
                          </button>
                        ) : (
                          <button
                            onClick={() => setDeletingId(row.id)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </DroppableRow>
                  )
                })}
              </div>
            </div>
          </div>

          <DragOverlay>
            {activeRow && (
              <div className="flex items-center rounded border border-gray-300 bg-white text-sm shadow-lg"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="flex w-[28px] shrink-0 items-center justify-center">
                  <GripVertical size={14} className="text-gray-400" />
                </div>
                <div className="w-[260px] shrink-0 px-3 truncate">{activeRow.description}</div>
                <div className="w-[120px] shrink-0 px-3">{activeRow.date}</div>
                <div className={`w-[120px] shrink-0 px-3 text-right ${
                  activeRow.amount_cents > 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  {formatCents(activeRow.amount_cents)}
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <SnapshotPanel open={snapshotOpen} onClose={() => setSnapshotOpen(false)} />
    </div>
  )
}
