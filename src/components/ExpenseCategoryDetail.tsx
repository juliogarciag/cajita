import { useState, useEffect, useRef, useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { eq } from '@tanstack/db'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft, Pin, Plus, Download } from 'lucide-react'
import { toast } from 'sonner'
import { expenseItemsCollection, type ExpenseItem } from '#/lib/expense-items-collection.js'
import { expenseCategoriesCollection } from '#/lib/expense-categories-collection.js'
import { expenseItemNotesCollection } from '#/lib/expense-item-notes-collection.js'
import type { TeamMember } from '#/lib/team-members-collection.js'
import { formatCents, formatSoles, toISODate } from '#/lib/format.js'
import { expenseTotals } from '#/lib/expense-totals.js'
import { useDateFormat } from '#/lib/date-format.js'
import { createExpenseItem, updateExpenseItem, deleteExpenseItem } from '#/server/expense-items.js'
import { upsertExpenseItemNote, deleteExpenseItemNote, getTeamMembers } from '#/server/notes.js'
import { updateExpenseCategory } from '#/server/expense-categories.js'
import { setCategoryPinned } from '#/lib/pin-category.js'
import { ColorPicker } from './ColorPicker.js'
import { ExpenseItemRow } from './ExpenseItemRow.js'
import { YearSwitcher } from './YearSwitcher.js'
import { ROW_HEIGHT } from './TableRow.js'

export function ExpenseCategoryDetail() {
  const { categoryId } = useParams({ strict: false }) as { categoryId: string }
  const { highlightItem, year } = useSearch({ strict: false }) as {
    highlightItem?: string
    year?: number
  }
  const { formatDate } = useDateFormat()
  const navigate = useNavigate()

  const currentYear = new Date().getFullYear()
  const selectedYear = year ?? currentYear

  const parentRef = useRef<HTMLDivElement>(null)
  const [newItemId, setNewItemId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null)
  const scrollToEnd = useRef(false)
  const initialScroll = useRef(true)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)

  const { data: categories } = useLiveQuery((q) => q.from({ c: expenseCategoriesCollection }))

  const category = categories.find((c) => c.id === categoryId)

  const { data: allItems } = useLiveQuery((q) =>
    q
      .from({ i: expenseItemsCollection })
      .where(({ i }) => eq(i.expense_category_id, categoryId as typeof i.expense_category_id))
      .orderBy(({ i }) => i.date, 'asc')
      .orderBy(({ i }) => i.sort_position, 'asc'),
  )

  // Items shown: only the selected year
  const items = useMemo(
    () => allItems.filter((i: ExpenseItem) => i.date.slice(0, 4) === String(selectedYear)),
    [allItems, selectedYear],
  )

  // Years offered by the switcher: every year with data, plus the current and
  // selected years so the active option always exists. Newest first — that's
  // what you usually want, and the list only grows.
  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear, selectedYear])
    for (const i of allItems) years.add(Number(i.date.slice(0, 4)))
    return [...years].sort((a, b) => b - a)
  }, [allItems, currentYear, selectedYear])

  const handleSelectYear = (y: number) => {
    void navigate({
      to: '/finances/expense-categories/$categoryId',
      params: { categoryId },
      search: { year: y },
    })
  }

  // Re-run the initial scroll (to the newest items) when switching years
  useEffect(() => {
    initialScroll.current = true
  }, [selectedYear])

  const { data: itemNotes } = useLiveQuery((q) => q.from({ n: expenseItemNotesCollection }))

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  useEffect(() => {
    getTeamMembers()
      .then(setTeamMembers)
      .catch(() => {})
  }, [])

  const noteMap = useMemo(
    () => Object.fromEntries(itemNotes.map((n) => [n.expense_item_id, n])),
    [itemNotes],
  )

  // Merge rows and month dividers into a single flat list for the virtualizer
  type TableItem =
    | { type: 'row'; data: ExpenseItem }
    | { type: 'month-divider'; label: string; isYearBoundary: boolean; height: number }

  const tableItems = useMemo((): TableItem[] => {
    if (items.length === 0) return []
    const result: TableItem[] = []
    let prevMonth = ''
    let prevYear = ''

    for (let i = 0; i < items.length; i++) {
      const row = items[i]
      const curMonth = row.date.slice(0, 7)
      const curYear = row.date.slice(0, 4)

      if (i > 0 && curMonth !== prevMonth) {
        const isYearBoundary = curYear !== prevYear
        const [y, m] = curMonth.split('-')
        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', {
          month: 'long',
          year: 'numeric',
        })
        result.push({
          type: 'month-divider',
          label,
          isYearBoundary,
          height: isYearBoundary ? 32 : 28,
        })
      }
      result.push({ type: 'row', data: row })
      prevMonth = curMonth
      prevYear = curYear
    }
    return result
  }, [items])

  const virtualizer = useVirtualizer({
    count: tableItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = tableItems[index]
      if (item.type === 'month-divider') return item.height
      return ROW_HEIGHT
    },
    overscan: 20,
  })

  // Scroll to highlighted row (search palette navigation) or bottom on initial load
  useEffect(() => {
    if (items.length === 0) return
    if (initialScroll.current) {
      initialScroll.current = false
      if (highlightItem) {
        const idx = tableItems.findIndex(
          (item) => item.type === 'row' && item.data.id === highlightItem,
        )
        if (idx >= 0) {
          setTimeout(() => {
            virtualizer.scrollToIndex(idx, { align: 'center' })
            setHighlightedItemId(highlightItem)
            setTimeout(() => setHighlightedItemId(null), 2000)
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
  }, [items, tableItems, highlightItem, virtualizer])

  const handleDownloadCsv = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = [
      ['Description', 'Date', 'Amount (Soles)', 'Amount (USD)'],
      ...items.map((item: ExpenseItem) => [
        escape(item.description || ''),
        escape(formatDate(item.date)),
        item.amount_soles_cents != null ? (item.amount_soles_cents / 100).toFixed(2) : '',
        item.amount_usd_cents != null ? (item.amount_usd_cents / 100).toFixed(2) : '',
      ]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${category?.name ?? 'expenses'}-${selectedYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!category) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-gray-500">Category not found.</p>
        <Link to="/finances/expense-categories" className="text-sm text-blue-600 hover:underline">
          Back to categories
        </Link>
      </div>
    )
  }

  // The pending bucket is tracked separately from the USD total, never blended
  // into it — see expense-totals for what counts as pending.
  const { usd: totalUsd, pendingSoles, pendingCount } = expenseTotals(items)

  const handleAdd = async () => {
    setIsAdding(true)
    try {
      // New expenses land in the year being viewed: today for the current
      // year, Dec 31 for past years (so the row appears at the end either way).
      const date = selectedYear === currentYear ? toISODate(new Date()) : `${selectedYear}-12-31`
      const result = await createExpenseItem({
        data: {
          expense_category_id: categoryId,
          description: '',
          date,
        },
      })
      setNewItemId(result.item.id)
      scrollToEnd.current = true
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add expense')
    } finally {
      setIsAdding(false)
    }
  }

  const handleUpdate = async (
    id: string,
    updates: Partial<
      Pick<ExpenseItem, 'description' | 'date' | 'amount_soles_cents' | 'amount_usd_cents'>
    >,
  ) => {
    try {
      await updateExpenseItem({ data: { id, ...updates } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update expense')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteExpenseItem({ data: { id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleRename = async () => {
    const name = nameDraft.trim()
    setEditingName(false)
    if (!name || name === category.name) return
    try {
      await updateExpenseCategory({ data: { id: category.id, name } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename category')
    }
  }

  const handleColorChange = async (color: string) => {
    // Stay open — the picker also manages saved colors, so closing on every
    // pick would fight the user. The color dot toggles it shut.
    if (color === category.color) return
    try {
      await updateExpenseCategory({ data: { id: category.id, color } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update color')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/finances/expense-categories"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Change color"
              onClick={() => setShowColorPicker((v) => !v)}
              className="h-4 w-4 rounded-full transition-transform hover:scale-110"
              style={{ backgroundColor: category.color }}
            />
            {editingName ? (
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                onBlur={handleRename}
                autoFocus
                className="rounded border border-gray-300 px-2 py-0.5 text-2xl font-bold"
              />
            ) : (
              <h1
                className="cursor-pointer text-2xl font-bold hover:underline"
                title="Rename category"
                onClick={() => {
                  setNameDraft(category.name)
                  setEditingName(true)
                }}
              >
                {category.name}
              </h1>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void setCategoryPinned(category.id, !category.pinned)}
            aria-pressed={category.pinned ?? false}
            aria-label={category.pinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
            title={category.pinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
              category.pinned
                ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Pin size={16} fill={category.pinned ? 'currentColor' : 'none'} />
            {category.pinned ? 'Pinned' : 'Pin'}
          </button>
          <button
            onClick={handleDownloadCsv}
            disabled={items.length === 0}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            title="Download as CSV"
          >
            <Download size={16} />
            CSV
          </button>
          <button
            onClick={handleAdd}
            disabled={isAdding}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <Plus size={16} />
            {isAdding ? 'Adding…' : 'Add Expense'}
          </button>
        </div>
      </div>

      {showColorPicker && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white p-3">
          <span className="text-xs text-gray-500">Color</span>
          <ColorPicker value={category.color} onChange={handleColorChange} />
        </div>
      )}

      {/* Summary bar */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-500">
              Expenses: <span className="font-medium text-gray-900">{items.length}</span>
            </span>
            <span className="text-gray-500">
              Total (USD):{' '}
              <span className="font-medium text-gray-900">{formatCents(totalUsd)}</span>
            </span>
            <span
              className="text-gray-500"
              title="Soles spent on items that have no USD amount yet — money not exchanged so far"
            >
              Pending exchange:{' '}
              <span
                className={`font-medium ${pendingSoles !== 0 ? 'text-amber-600' : 'text-gray-900'}`}
              >
                {formatSoles(pendingSoles)}
              </span>
              {pendingCount > 0 && (
                <span className="text-xs text-gray-400">
                  {' '}
                  · {pendingCount} {pendingCount === 1 ? 'item' : 'items'}
                </span>
              )}
            </span>
          </div>
          <YearSwitcher
            years={availableYears}
            selected={selectedYear}
            onSelect={handleSelectYear}
          />
        </div>
      </div>

      {/* Items table */}
      <div
        className="overflow-hidden rounded-lg border border-gray-200 bg-white"
        data-editable-table
      >
        <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
          <div className="w-[22px] shrink-0" />
          <div className="min-w-[200px] flex-1 px-3 py-2">Description</div>
          <div className="w-[110px] shrink-0 px-3 py-2">Date</div>
          <div className="w-[110px] shrink-0 px-3 py-2 text-right">Soles</div>
          <div className="w-[110px] shrink-0 px-3 py-2 text-right">USD</div>
          <div className="w-[80px] shrink-0" />
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No expenses in {selectedYear}. Add your first one.
          </div>
        ) : (
          <div
            ref={parentRef}
            className="overflow-auto"
            style={{
              height: Math.min(virtualizer.getTotalSize(), window.innerHeight - 340),
            }}
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = tableItems[virtualRow.index]

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
                        transform: `translateY(${virtualRow.start}px)`,
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

                const row = item.data
                return (
                  <ExpenseItemRow
                    key={row.id}
                    id={row.id}
                    item={row}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    highlight={highlightedItemId === row.id}
                    autoEditDescription={row.id === newItemId}
                    note={noteMap[row.id] ?? null}
                    noteOpen={noteOpenId === row.id}
                    teamMembers={teamMembers}
                    onNoteOpenChange={(open) => setNoteOpenId(open ? row.id : null)}
                    onNoteSave={(content) =>
                      upsertExpenseItemNote({ data: { expense_item_id: row.id, content } })
                    }
                    onNoteDelete={() =>
                      deleteExpenseItemNote({ data: { expense_item_id: row.id } })
                    }
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
