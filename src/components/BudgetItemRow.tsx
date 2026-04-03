import { useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { Link as LinkIcon, Unlink, Lock, Trash2, ExternalLink } from 'lucide-react'
import type { BudgetItem } from '#/lib/budget-items-collection.js'
import { formatCents, formatSoles, parseDollarsTocents } from '#/lib/format.js'
import { EditableCell } from './EditableCell.js'
import { ConfirmButton } from './ConfirmButton.js'
import { TableRow } from './TableRow.js'

interface BudgetItemRowProps {
  id?: string
  item: BudgetItem
  frozen: boolean
  highlight?: boolean
  onUpdate: (
    id: string,
    updates: Partial<
      Pick<
        BudgetItem,
        'description' | 'date' | 'amount_local_cents' | 'amount_cents' | 'accounting_date'
      >
    >,
  ) => void
  onDelete: (id: string) => void
  onSync: () => void
  onUnsync: () => void
}

export function BudgetItemRow({
  id,
  item,
  frozen,
  highlight = false,
  onUpdate,
  onDelete,
  onSync,
  onUnsync,
}: BudgetItemRowProps) {
  const isSynced = !!item.movement_id
  const disabled = frozen

  const handleFieldSave = useCallback(
    (field: string, rawValue: string) => {
      if (field === 'amount_cents') {
        const cents = parseDollarsTocents(rawValue)
        if (cents === null) return
        onUpdate(item.id, { amount_cents: -Math.abs(cents) })
      } else if (field === 'amount_local_cents') {
        const cents = parseDollarsTocents(rawValue)
        if (cents === null) return
        onUpdate(item.id, { amount_local_cents: -Math.abs(cents) })
      } else if (field === 'description') {
        onUpdate(item.id, { description: rawValue })
      } else if (field === 'date') {
        onUpdate(item.id, { date: rawValue })
      } else if (field === 'accounting_date') {
        onUpdate(item.id, { accounting_date: rawValue || null })
      }
    },
    [item.id, onUpdate],
  )

  return (
    <TableRow id={id} frozen={frozen} highlight={highlight}>
      <div className="w-[22px] shrink-0 flex items-center pl-[10px]">
        {frozen
          ? <Lock size={10} className="text-indigo-400" />
          : <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />}
      </div>
      <div className="min-w-[200px] flex-1 pr-1">
        <EditableCell
          value={item.description}
          type="text"
          disabled={disabled}
          onSave={(v) => handleFieldSave('description', v)}
        />
      </div>
      <div className="w-[110px] shrink-0 px-1">
        <EditableCell
          value={item.date}
          type="date"
          disabled={disabled}
          onSave={(v) => handleFieldSave('date', v)}
        />
      </div>
      <div className="w-[110px] shrink-0 px-1">
        <EditableCell
          value={
            item.amount_local_cents != null ? formatSoles(Math.abs(item.amount_local_cents)) : ''
          }
          type="amount"
          disabled={disabled}
          className="text-right text-gray-500"
          onSave={(v) => handleFieldSave('amount_local_cents', v)}
        />
      </div>
      <div className="w-[110px] shrink-0 px-1">
        <EditableCell
          value={item.amount_cents !== 0 ? formatCents(Math.abs(item.amount_cents)) : ''}
          type="amount"
          disabled={disabled}
          className="text-right"
          onSave={(v) => handleFieldSave('amount_cents', v)}
        />
      </div>
      <div className="w-[110px] shrink-0 px-1">
        <EditableCell
          value={item.accounting_date ?? ''}
          type="date"
          disabled={disabled}
          onSave={(v) => handleFieldSave('accounting_date', v)}
        />
      </div>
      <div className="w-[80px] shrink-0 flex items-center justify-center">
        {isSynced ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            {frozen ? <Lock size={12} /> : <LinkIcon size={12} />}
            Synced
          </span>
        ) : (
          <span className="text-xs text-gray-400">Pending</span>
        )}
      </div>
      <div className="flex w-[56px] shrink-0 items-center justify-end gap-1 px-2">
        {frozen ? (
          isSynced && (
            <Link
              to="/finances/movements"
              search={{ highlight: item.movement_id! }}
              tabIndex={-1}
              className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
              title="View in movements"
            >
              <ExternalLink size={12} />
            </Link>
          )
        ) : isSynced ? (
          <div className="flex items-center gap-0.5">
            <Link
              to="/finances/movements"
              search={{ highlight: item.movement_id! }}
              tabIndex={-1}
              className="rounded p-1 text-gray-300 hover:bg-blue-50 hover:text-blue-600"
              title="View in movements"
            >
              <ExternalLink size={12} />
            </Link>
            <button
              onClick={onUnsync}
              tabIndex={-1}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-orange-600"
              title="Unsync from accounting"
            >
              <Unlink size={12} />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={onSync}
              tabIndex={-1}
              disabled={!item.description || item.amount_cents === 0 || !item.accounting_date}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
              title={
                !item.description || item.amount_cents === 0 || !item.accounting_date
                  ? 'Fill description, USD amount, and accounting date to sync'
                  : 'Sync to accounting'
              }
            >
              <LinkIcon size={12} />
              Sync
            </button>
            <ConfirmButton
              onConfirm={() => onDelete(item.id)}
              tabIndex={-1}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
            >
              <Trash2 size={12} />
            </ConfirmButton>
          </>
        )}
      </div>
    </TableRow>
  )
}
