import { useRef, useMemo, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLiveQuery } from '@tanstack/react-db'
import { Plus, Trash2 } from 'lucide-react'
import { movementsCollection, type Movement } from '#/lib/movements-collection.js'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'
import { formatCents, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { EditableCell } from './EditableCell.js'

const ROW_HEIGHT = 40

interface MovementWithTotal extends Movement {
  total_cents: number
  category_name: string | null
  category_color: string | null
}

export function MovementsTable() {
  const parentRef = useRef<HTMLDivElement>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const withTotals: MovementWithTotal[] = useMemo(() => {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Movements</h1>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          <Plus size={16} />
          Add Movement
        </button>
      </div>

      {withTotals.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-gray-500">No movements yet. Add your first one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* Header */}
          <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
            <div className="w-[280px] shrink-0 px-3 py-2">Description</div>
            <div className="w-[120px] shrink-0 px-3 py-2">Date</div>
            <div className="w-[120px] shrink-0 px-3 py-2 text-right">Amount</div>
            <div className="w-[120px] shrink-0 px-3 py-2 text-right">Total</div>
            <div className="flex-1 px-3 py-2">Category</div>
            <div className="w-[48px] shrink-0" />
          </div>

          {/* Virtualized body */}
          <div ref={parentRef} className="max-h-[calc(100vh-220px)] overflow-auto">
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
                  <div
                    key={row.id}
                    className="absolute left-0 top-0 flex w-full items-center border-b border-gray-100 text-sm hover:bg-gray-50"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="w-[280px] shrink-0 px-1">
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
                    <div className="w-[120px] shrink-0 px-3 py-1 text-right font-medium">
                      {formatCents(row.total_cents)}
                    </div>
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
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
