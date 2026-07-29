import { useState, useRef, useEffect, useCallback } from 'react'
import { AmountInput } from './AmountInput.js'
import { DatePickerCell } from './DatePickerCell.js'
import { useDateFormat } from '#/lib/date-format.js'

type CellType = 'text' | 'date' | 'amount'

interface EditableCellProps {
  value: string
  /**
   * A suggestion to start from when the cell is empty — the previous reading's
   * figure. Kept separate from `value` on purpose: `value` means "what is
   * stored", and accepting a suggestion has to register as a change so it
   * actually saves. Shown muted until committed.
   */
  carried?: string
  type: CellType
  onSave: (value: string) => void
  onTab?: (shift: boolean) => void
  onEnter?: () => void
  className?: string
  autoEdit?: boolean
  disabled?: boolean
}

export function EditableCell({
  value,
  carried,
  type,
  onSave,
  onTab,
  onEnter,
  className = '',
  autoEdit = false,
  disabled = false,
}: EditableCellProps) {
  const [editing, setEditing] = useState(autoEdit)
  const [draft, setDraft] = useState(value || carried || '')
  const inputRef = useRef<HTMLInputElement>(null)
  const { formatDate } = useDateFormat()

  useEffect(() => {
    if (autoEdit) setEditing(true)
  }, [autoEdit])

  useEffect(() => {
    setDraft(value || carried || '')
  }, [value, carried])

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

  const focusAdjacentCell = useCallback((shift: boolean): boolean => {
    const cell = cellRef.current
    if (!cell) return false
    const table = cell.closest('[data-editable-table]')
    if (!table) return false
    const cells = Array.from(
      table.querySelectorAll<HTMLElement>('[data-editable-cell]:not([data-disabled])'),
    )
    const idx = cells.indexOf(cell)
    if (idx < 0) return false
    const next = cells[shift ? idx - 1 : idx + 1]
    if (next) {
      setTimeout(() => next.click(), 0)
      return true
    }
    return false
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancel()
      } else if (e.key === 'Tab') {
        const navigated = onTab ? (onTab(e.shiftKey), true) : focusAdjacentCell(e.shiftKey)
        if (navigated) {
          e.preventDefault()
          save()
        } else {
          save()
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        save()
        if (onEnter) {
          onEnter()
        } else {
          focusAdjacentCell(false)
        }
      }
    },
    [cancel, save, onTab, onEnter, focusAdjacentCell],
  )

  // Display value: use draft for optimistic update (avoids blink), format dates
  const displayValue = type === 'date' ? formatDate(draft) : draft
  // Nothing stored yet, but a suggestion is showing — say so visually.
  const showingCarried = !value && !!carried

  if (disabled || !editing) {
    return (
      <div
        ref={cellRef}
        data-editable-cell
        {...(disabled ? { 'data-disabled': true } : {})}
        className={`w-full rounded border border-transparent px-2 py-1.5 ${disabled ? '' : 'cursor-pointer hover:bg-gray-100'} ${showingCarried ? 'italic text-gray-400' : ''} ${className}`}
        onClick={disabled ? undefined : () => setEditing(true)}
        title={showingCarried ? 'Carried from the previous reading — not saved yet' : undefined}
      >
        {displayValue || <span className="text-gray-400">—</span>}
      </div>
    )
  }

  if (type === 'date') {
    return (
      <div ref={cellRef} data-editable-cell>
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
          onTab={onTab ?? ((shift) => focusAdjacentCell(shift))}
          onEnter={onEnter ?? (() => focusAdjacentCell(false))}
        />
      </div>
    )
  }

  if (type === 'amount') {
    return (
      <div ref={cellRef} data-editable-cell>
        <AmountInput
          value={value}
          carried={carried}
          onSave={(v) => {
            onSave(v)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
          onTab={onTab ?? ((shift) => focusAdjacentCell(shift))}
          onEnter={onEnter ?? (() => focusAdjacentCell(false))}
          className={className}
        />
      </div>
    )
  }

  return (
    <div ref={cellRef} data-editable-cell>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
      />
    </div>
  )
}
