import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { expenseItemsCollection } from '#/lib/expense-items-collection'
import { expenseItemNotesCollection } from '#/lib/expense-item-notes-collection'
import { buildExcerpt, runSearch, type SearchResult } from '#/lib/search'
import { formatCents, formatDisplayDate, formatSoles } from '#/lib/format'
import { HighlightedText } from './HighlightedText'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SearchPalette({ open, onOpenChange }: Props) {
  const [input, setInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const navigate = useNavigate()

  // Reset input whenever the palette closes — conventional palette UX.
  useEffect(() => {
    if (!open) {
      setInput('')
      setDebouncedQuery('')
    }
  }, [open])

  // Debounce input → query (~120ms).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(input), 120)
    return () => clearTimeout(t)
  }, [input])

  const { data: expenseItems = [] } = useLiveQuery((q) => q.from({ i: expenseItemsCollection }))
  const { data: expenseItemNotes = [] } = useLiveQuery((q) =>
    q.from({ n: expenseItemNotesCollection }),
  )

  const results = useMemo<SearchResult[]>(() => {
    if (!debouncedQuery.trim()) return []
    return runSearch(debouncedQuery, {
      expenseItems,
      expenseItemNotes,
    })
  }, [debouncedQuery, expenseItems, expenseItemNotes])

  const handleSelect = (result: SearchResult) => {
    onOpenChange(false)
    void navigate({
      to: '/finances/expense-categories/$categoryId',
      params: { categoryId: result.item.expense_category_id },
      search: { highlightItem: result.item.id },
    })
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search expenses"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-40 bg-black/30"
      contentClassName="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 outline-none"
    >
      <Dialog.Title className="sr-only">Search expenses</Dialog.Title>
      <Command.Input
        value={input}
        onValueChange={setInput}
        placeholder="Search expenses…"
        autoFocus
        className="w-full border-b border-gray-200 px-4 py-3 text-base outline-none placeholder:text-gray-400"
      />

      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        {debouncedQuery.trim() && results.length === 0 ? (
          <Command.Empty className="px-3 py-8 text-center text-sm text-gray-500">
            No expenses match.
          </Command.Empty>
        ) : null}

        {results.map((result) => (
          <ResultRow key={result.item.id} result={result} onSelect={handleSelect} />
        ))}
      </Command.List>

      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
        Tip: type a number to search by amount.
      </div>
    </Command.Dialog>
  )
}

function ResultRow({
  result,
  onSelect,
}: {
  result: SearchResult
  onSelect: (r: SearchResult) => void
}) {
  const allHits = [...result.descHits, ...result.noteHits]

  // Show note excerpt only when the description didn't itself match.
  const showNoteExcerpt = result.descHits.length === 0 && result.noteHits.length > 0
  const noteExcerpt = showNoteExcerpt ? buildExcerpt(result.noteText, result.noteHits) : ''

  const usdAmount = result.item.amount_usd_cents
  const solesAmount = result.item.amount_soles_cents

  return (
    <Command.Item
      value={result.item.id}
      onSelect={() => onSelect(result)}
      className="flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2 text-sm aria-selected:bg-blue-50 data-[selected=true]:bg-blue-50"
    >
      <div className="flex items-center gap-2">
        <span className="truncate font-medium text-gray-900">
          <HighlightedText text={result.item.description} terms={allHits} />
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{formatDisplayDate(result.item.date)}</span>
        {solesAmount != null ? (
          <>
            <span>·</span>
            <span>{formatSoles(solesAmount)}</span>
          </>
        ) : null}
        {usdAmount != null ? (
          <>
            <span>·</span>
            <span>{formatCents(usdAmount)}</span>
          </>
        ) : null}
      </div>
      {noteExcerpt ? (
        <div className="mt-0.5 truncate text-xs italic text-gray-600">
          <HighlightedText text={noteExcerpt} terms={result.noteHits} />
        </div>
      ) : null}
    </Command.Item>
  )
}
