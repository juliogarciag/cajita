import { useState, useRef, useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { createBudgetItem } from '#/server/budget-items.js'
import { parseDollarsTocents, toISODate } from '#/lib/format.js'
import { EditableCell } from './EditableCell.js'
import { TableRow } from './TableRow.js'

interface NewBudgetItemRowProps {
  budgetId: string
  onDone: () => void
  onCancel: () => void
}

export function NewBudgetItemRow({ budgetId, onDone, onCancel }: NewBudgetItemRowProps) {
  const [fields, setFields] = useState({
    description: '',
    date: toISODate(new Date()),
    amountLocal: '',
    amount: '',
  })

  // Refs hold the latest values for use in async callbacks (avoids stale closures)
  const fieldsRef = useRef(fields)

  const rowRef = useRef<HTMLDivElement>(null)
  const savingRef = useRef(false)
  const cancelingRef = useRef(false)

  // Scroll into view on mount
  useEffect(() => {
    rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const setField = useCallback((field: keyof typeof fields, value: string) => {
    const next = { ...fieldsRef.current, [field]: value }
    fieldsRef.current = next
    setFields(next)
  }, [])

  const save = useCallback(async () => {
    if (savingRef.current || cancelingRef.current) return
    const { description, date, amountLocal, amount } = fieldsRef.current
    if (!description) {
      onCancel()
      return
    }
    savingRef.current = true
    try {
      const usdCents = amount ? parseDollarsTocents(amount) : 0
      const localCents = amountLocal ? parseDollarsTocents(amountLocal) : null
      await createBudgetItem({
        data: {
          budget_id: budgetId,
          description,
          date,
          amount_local_cents: localCents ? -Math.abs(localCents) : null,
          amount_cents: usdCents ? -Math.abs(usdCents) : 0,
        },
      })
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add item')
      savingRef.current = false
    }
  }, [budgetId, onDone, onCancel])

  const handleCancel = useCallback(() => {
    cancelingRef.current = true
    onCancel()
  }, [onCancel])

  // Save when focus leaves the entire row
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (cancelingRef.current) return
      if (!rowRef.current?.contains(document.activeElement)) {
        save()
      }
    }, 100)
  }, [save])

  // Escape to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleCancel])

  return (
    <div ref={rowRef} onBlur={handleBlur}>
      <TableRow>
        <div className="w-[22px] shrink-0 flex items-center pl-[10px]">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
        </div>
        <div className="min-w-[200px] flex-1 pr-1">
          <EditableCell
            value={fields.description}
            type="text"
            autoEdit
            onSave={(v) => setField('description', v)}
          />
        </div>
        <div className="w-[110px] shrink-0 px-1">
          <EditableCell
            value={fields.date}
            type="date"
            onSave={(v) => setField('date', v)}
          />
        </div>
        <div className="w-[110px] shrink-0 px-1">
          <EditableCell
            value={fields.amountLocal}
            type="amount"
            className="text-right text-gray-500"
            onSave={(v) => setField('amountLocal', v)}
          />
        </div>
        <div className="w-[110px] shrink-0 px-1">
          <EditableCell
            value={fields.amount}
            type="amount"
            className="text-right"
            onSave={(v) => setField('amount', v)}
          />
        </div>
        <div className="w-[110px] shrink-0 px-2 py-1.5 text-sm text-gray-300">
          —
        </div>
        <div className="w-[80px] shrink-0" />
        <div className="flex w-[56px] shrink-0 items-center justify-end px-2">
          <button
            onMouseDown={(e) => { e.preventDefault(); handleCancel() }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            tabIndex={-1}
            title="Cancel"
          >
            <X size={12} />
          </button>
        </div>
      </TableRow>
    </div>
  )
}
