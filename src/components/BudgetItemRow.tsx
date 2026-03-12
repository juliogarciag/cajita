import { useState, useCallback, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Link as LinkIcon, Unlink, Lock, Trash2, ExternalLink } from 'lucide-react'
import type { BudgetItem } from '#/lib/budget-items-collection.js'
import { formatCents, formatSoles, parseDollarsTocents } from '#/lib/format.js'
import { EditableCell } from './EditableCell.js'

interface BudgetItemRowProps {
  item: BudgetItem
  frozen: boolean
  onUpdate: (
    id: string,
    updates: Partial<Pick<BudgetItem, 'description' | 'date' | 'amount_local_cents' | 'amount_cents' | 'accounting_date'>>,
  ) => void
  onDelete: (id: string) => void
  onSync: () => void
  onUnsync: () => void
}

export function BudgetItemRow({ item, frozen, onUpdate, onDelete, onSync, onUnsync }: BudgetItemRowProps) {
  const [deletingId, setDeletingId] = useState(false)
  const isSynced = !!item.movement_id
  const disabled = frozen

  // Dismiss delete confirmation on click-away
  useEffect(() => {
    if (!deletingId) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-confirm-delete]')) {
        setDeletingId(false)
      }
    }
    document.addEventListener('click', handler, { capture: true })
    return () => document.removeEventListener('click', handler, { capture: true })
  }, [deletingId])

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
    <div
      className={`flex items-center border-b border-gray-100 text-sm ${
        frozen ? 'opacity-50' : 'hover:bg-gray-50'
      }`}
    >
      <div className="w-[200px] shrink-0 px-1">
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
          value={item.amount_local_cents != null ? formatSoles(Math.abs(item.amount_local_cents)) : ''}
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
      <div className="flex flex-1 items-center justify-end gap-1 px-2">
        {frozen ? (
          <Lock size={14} className="text-gray-300" />
        ) : isSynced ? (
          <div className="flex items-center gap-0.5">
            <Link
              to="/finances/movements"
              search={{ highlight: item.movement_id! }}
              className="rounded p-1 text-gray-300 hover:bg-blue-50 hover:text-blue-600"
              title="View in movements"
            >
              <ExternalLink size={12} />
            </Link>
            <button
              onClick={onUnsync}
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
              disabled={!item.description || item.amount_cents === 0 || !item.accounting_date}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
              title={!item.description || item.amount_cents === 0 || !item.accounting_date
                ? 'Fill description, USD amount, and accounting date to sync'
                : 'Sync to accounting'}
            >
              <LinkIcon size={12} />
              Sync
            </button>
            {deletingId ? (
              <button
                data-confirm-delete
                onClick={() => {
                  onDelete(item.id)
                  setDeletingId(false)
                }}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Yes
              </button>
            ) : (
              <button
                onClick={() => setDeletingId(true)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
              >
                <Trash2 size={12} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
