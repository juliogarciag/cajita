import { useState, useRef, useEffect, useCallback } from 'react'
import { CategorySelect } from './CategorySelect.js'
import { DatePickerCell } from './DatePickerCell.js'
import { useDateFormat } from '#/lib/date-format.js'

type CellType = 'text' | 'date' | 'amount' | 'category'

interface EditableCellProps {
  value: string
  type: CellType
  categoryId?: string | null
  categoryColor?: string | null
  onSave: (value: string) => void
  onTab?: (shift: boolean) => void
  onEnter?: () => void
  className?: string
  autoEdit?: boolean
  disabled?: boolean
}

export function EditableCell({
  value,
  type,
  categoryId,
  categoryColor,
  onSave,
  onTab,
  onEnter,
  className = '',
  autoEdit = false,
  disabled = false,
}: EditableCellProps) {
  const [editing, setEditing] = useState(autoEdit)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const { formatDate } = useDateFormat()

  useEffect(() => {
    if (autoEdit) setEditing(true)
  }, [autoEdit])

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const save = useCallback(() => {
    if (draft !== value) {
      onSave(draft)
    }
    setEditing(false)
  }, [draft, value, onSave])

  const cancel = useCallback(() => {
    setDraft(value)
    setEditing(false)
  }, [value])

  const cellRef = useRef<HTMLDivElement>(null)

  const focusAdjacentCell = useCallback((shift: boolean) => {
    const cell = cellRef.current
    if (!cell) return
    const table = cell.closest('[data-editable-table]')
    if (!table) return
    const cells = Array.from(table.querySelectorAll<HTMLElement>('[data-editable-cell]:not([data-disabled])'))
    const idx = cells.indexOf(cell)
    if (idx < 0) return
    const next = cells[shift ? idx - 1 : idx + 1]
    if (next) {
      setTimeout(() => next.click(), 0)
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancel()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        save()
        if (onTab) {
          onTab(e.shiftKey)
        } else {
          focusAdjacentCell(e.shiftKey)
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        save()
        onEnter?.()
      }
    },
    [cancel, save, onTab, onEnter, focusAdjacentCell],
  )

  const handleAmountKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (type === 'amount') {
        const allowed = /^[0-9.\-]$/
        if (
          !allowed.test(e.key) &&
          !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape', 'Enter', 'Home', 'End'].includes(e.key) &&
          !e.metaKey &&
          !e.ctrlKey
        ) {
          e.preventDefault()
        }
      }
      handleKeyDown(e)
    },
    [type, handleKeyDown],
  )

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === 'amount') {
        setDraft(e.target.value.replace(/[^0-9.\-]/g, ''))
      } else {
        setDraft(e.target.value)
      }
    },
    [type],
  )

  // Display value: format dates using user preference
  const displayValue = type === 'date' ? formatDate(value) : value

  if (disabled || !editing) {
    return (
      <div
        ref={cellRef}
        data-editable-cell
        {...(disabled ? { 'data-disabled': true } : {})}
        className={`w-full rounded border border-transparent px-2 py-1.5 ${disabled ? '' : 'cursor-pointer hover:bg-gray-100'} ${type === 'category' ? 'flex items-center gap-1.5' : ''} ${className}`}
        onClick={disabled ? undefined : () => setEditing(true)}
      >
        {type === 'category' && categoryColor && (
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor }}
          />
        )}
        {displayValue || <span className="text-gray-400">—</span>}
      </div>
    )
  }

  if (type === 'category') {
    return (
      <div ref={cellRef} data-editable-cell onKeyDown={handleKeyDown} onBlur={save}>
        <CategorySelect
          value={categoryId ?? null}
          onChange={(id) => {
            onSave(id ?? '')
            setEditing(false)
          }}
          autoFocus
        />
      </div>
    )
  }

  if (type === 'date') {
    return (
      <DatePickerCell
        value={value}
        onSave={(v) => {
          onSave(v)
          setEditing(false)
        }}
        onCancel={() => {
          setDraft(value)
          setEditing(false)
        }}
        onTab={onTab}
        onEnter={onEnter}
      />
    )
  }

  return (
    <div ref={cellRef} data-editable-cell>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={handleAmountChange}
        onBlur={save}
        onKeyDown={handleAmountKeyDown}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
        inputMode={type === 'amount' ? 'decimal' : undefined}
      />
    </div>
  )
}
