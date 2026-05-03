import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { movementsCollection } from '#/lib/movements-collection'
import { movementNotesCollection } from '#/lib/movement-notes-collection'
import { budgetItemsCollection } from '#/lib/budget-items-collection'
import { budgetItemNotesCollection } from '#/lib/budget-item-notes-collection'
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

  const { data: movements = [] } = useLiveQuery((q) => q.from({ m: movementsCollection }))
  const { data: movementNotes = [] } = useLiveQuery((q) => q.from({ n: movementNotesCollection }))
  const { data: budgetItems = [] } = useLiveQuery((q) => q.from({ bi: budgetItemsCollection }))
  const { data: budgetItemNotes = [] } = useLiveQuery((q) =>
    q.from({ n: budgetItemNotesCollection }),
  )

  const results = useMemo<SearchResult[]>(() => {
    if (!debouncedQuery.trim()) return []
    return runSearch(debouncedQuery, {
      movements,
      movementNotes,
      budgetItems,
      budgetItemNotes,
    })
  }, [debouncedQuery, movements, movementNotes, budgetItems, budgetItemNotes])

  const handleSelect = (result: SearchResult) => {
    onOpenChange(false)
    if (result.kind === 'movement') {
      void navigate({
        to: '/finances/movements',
        search: { highlight: result.movement.id },
      })
    } else {
      void navigate({
        to: '/finances/budgets/$budgetId',
        params: { budgetId: result.item.budget_id },
        search: { highlightItem: result.item.id },
      })
    }
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search movements and budget items"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-40 bg-black/30"
      contentClassName="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 outline-none"
    >
      <Dialog.Title className="sr-only">Search movements and budget items</Dialog.Title>
      <Command.Input
        value={input}
        onValueChange={setInput}
        placeholder="Search movements and budget items…"
        autoFocus
        className="w-full border-b border-gray-200 px-4 py-3 text-base outline-none placeholder:text-gray-400"
      />

      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        {debouncedQuery.trim() && results.length === 0 ? (
          <Command.Empty className="px-3 py-8 text-center text-sm text-gray-500">
            No movements or budget items match.
          </Command.Empty>
        ) : null}

        {results.map((result) => (
          <ResultRow key={resultKey(result)} result={result} onSelect={handleSelect} />
        ))}
      </Command.List>

      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
        Tip: type a number to search by amount.
      </div>
    </Command.Dialog>
  )
}

function resultKey(r: SearchResult): string {
  return r.kind === 'movement' ? `m:${r.movement.id}` : `b:${r.item.id}`
}

function ResultRow({
  result,
  onSelect,
}: {
  result: SearchResult
  onSelect: (r: SearchResult) => void
}) {
  const allHits = [...result.descHits, ...result.noteHits]
  const description =
    result.kind === 'movement' ? result.movement.description : result.item.description
  const date = result.kind === 'movement' ? result.movement.date : result.item.date

  // Show note excerpt only when the description didn't itself match.
  const showNoteExcerpt = result.descHits.length === 0 && result.noteHits.length > 0
  const noteExcerpt = showNoteExcerpt ? buildExcerpt(result.noteText, result.noteHits) : ''

  const usdAmount =
    result.kind === 'movement' ? result.movement.amount_cents : result.item.amount_cents
  const localAmount = result.kind === 'budget_item' ? result.item.amount_local_cents : null

  return (
    <Command.Item
      value={resultKey(result)}
      onSelect={() => onSelect(result)}
      className="flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2 text-sm aria-selected:bg-blue-50 data-[selected=true]:bg-blue-50"
    >
      <div className="flex items-center gap-2">
        <TypeBadge kind={result.kind} />
        <span className="truncate font-medium text-gray-900">
          <HighlightedText text={description} terms={allHits} />
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{formatDisplayDate(date)}</span>
        <span>·</span>
        <span className={usdAmount < 0 ? 'text-red-600' : 'text-green-700'}>
          {formatCents(usdAmount)}
        </span>
        {localAmount != null ? (
          <>
            <span>·</span>
            <span className={localAmount < 0 ? 'text-red-600' : 'text-green-700'}>
              {formatSoles(localAmount)}
            </span>
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

function TypeBadge({ kind }: { kind: SearchResult['kind'] }) {
  if (kind === 'movement') {
    return (
      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700">
        Movement
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700">
      Budget item
    </span>
  )
}
