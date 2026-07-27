import { useCallback, type CSSProperties } from 'react'
import { Trash2 } from 'lucide-react'
import type { ExpenseItem } from '#/lib/expense-items-collection.js'
import type { ExpenseItemNote } from '#/lib/expense-item-notes-collection.js'
import type { TeamMember } from '#/lib/team-members-collection.js'
import { formatCents, formatSoles, parseDollarsTocents } from '#/lib/format.js'
import { EditableCell } from './EditableCell.js'
import { ConfirmButton } from './ConfirmButton.js'
import { TableRow } from './TableRow.js'
import { NotePopover, NoteIconButton } from './NotePopover.js'

interface ExpenseItemRowProps {
  id?: string
  item: ExpenseItem
  style?: CSSProperties
  highlight?: boolean
  autoEditDescription?: boolean
  note: ExpenseItemNote | null
  noteOpen: boolean
  teamMembers: TeamMember[]
  onNoteOpenChange: (open: boolean) => void
  onNoteSave: (content: string) => Promise<unknown>
  onNoteDelete: () => Promise<unknown>
  onUpdate: (
    id: string,
    updates: Partial<
      Pick<ExpenseItem, 'description' | 'date' | 'amount_soles_cents' | 'amount_usd_cents'>
    >,
  ) => void
  onDelete: (id: string) => void
}

export function ExpenseItemRow({
  id,
  item,
  style,
  highlight = false,
  autoEditDescription = false,
  note,
  noteOpen,
  teamMembers,
  onNoteOpenChange,
  onNoteSave,
  onNoteDelete,
  onUpdate,
  onDelete,
}: ExpenseItemRowProps) {
  const handleFieldSave = useCallback(
    (field: string, rawValue: string) => {
      if (field === 'amount_usd_cents' || field === 'amount_soles_cents') {
        // Empty input clears the amount (both are nullable)
        if (rawValue.trim() === '') {
          onUpdate(item.id, { [field]: null })
          return
        }
        const cents = parseDollarsTocents(rawValue)
        if (cents === null) return
        onUpdate(item.id, { [field]: Math.abs(cents) })
      } else if (field === 'description') {
        onUpdate(item.id, { description: rawValue })
      } else if (field === 'date') {
        onUpdate(item.id, { date: rawValue })
      }
    },
    [item.id, onUpdate],
  )

  // Soles amount with no USD amount = money not exchanged yet
  const isPending = item.amount_soles_cents != null && item.amount_usd_cents == null

  return (
    <TableRow id={id} highlight={highlight} style={style} data-row-id={item.id}>
      <div className="w-[22px] shrink-0 flex items-center pl-[10px]">
        <div
          title={isPending ? 'Pending — no USD amount yet' : undefined}
          className={`w-1.5 h-1.5 rounded-full ${isPending ? 'bg-amber-400' : 'bg-gray-300'}`}
        />
      </div>
      <div className="min-w-[200px] flex-1 pr-1">
        <EditableCell
          value={item.description}
          type="text"
          autoEdit={autoEditDescription}
          onSave={(v) => handleFieldSave('description', v)}
        />
      </div>
      <div className="w-[110px] shrink-0 px-1">
        <EditableCell value={item.date} type="date" onSave={(v) => handleFieldSave('date', v)} />
      </div>
      <div className="w-[110px] shrink-0 px-1">
        <EditableCell
          value={item.amount_soles_cents != null ? formatSoles(item.amount_soles_cents) : ''}
          type="amount"
          className="text-right text-gray-500"
          onSave={(v) => handleFieldSave('amount_soles_cents', v)}
        />
      </div>
      <div className="w-[110px] shrink-0 px-1">
        <EditableCell
          value={item.amount_usd_cents != null ? formatCents(item.amount_usd_cents) : ''}
          type="amount"
          className="text-right"
          onSave={(v) => handleFieldSave('amount_usd_cents', v)}
        />
      </div>
      <div className="flex w-[80px] shrink-0 items-center justify-end gap-1 px-2">
        <NoteIconButton hasNote={!!note} open={noteOpen} onOpenChange={onNoteOpenChange}>
          {noteOpen && (
            <NotePopover
              note={note}
              onOpenChange={onNoteOpenChange}
              teamMembers={teamMembers}
              onSave={onNoteSave}
              onDelete={onNoteDelete}
            />
          )}
        </NoteIconButton>
        <ConfirmButton
          onConfirm={() => onDelete(item.id)}
          tabIndex={-1}
          title="Delete expense?"
          description={
            <>
              <span className="font-medium text-gray-900">
                {item.description || 'This expense'}
              </span>{' '}
              and its note will be removed.
            </>
          }
          confirmLabel="Delete expense"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
        >
          <Trash2 size={12} />
        </ConfirmButton>
      </div>
    </TableRow>
  )
}
