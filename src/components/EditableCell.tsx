import { useState, useRef, useEffect, useCallback } from 'react'
import { CategorySelect } from './CategorySelect.js'
import { DatePickerCell } from './DatePickerCell.js'
import { useDateFormat } from '#/lib/date-format.js'

type CellType = 'text' | 'date' | 'amount' | 'category'

interface EditableCellProps {
  value: string
  type: CellType
  categoryId?: string | null
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancel()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        save()
        onTab?.(e.shiftKey)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        save()
        onEnter?.()
      }
    },
    [cancel, save, onTab, onEnter],
  )

  // Display value: format dates using user preference
  const displayValue = type === 'date' ? formatDate(value) : value

  if (disabled || !editing) {
    return (
      <div
        className={`rounded border border-transparent px-2 py-1 ${disabled ? '' : 'cursor-pointer hover:bg-gray-100'} ${className}`}
        onClick={disabled ? undefined : () => setEditing(true)}
      >
        {displayValue || <span className="text-gray-400">—</span>}
      </div>
    )
  }

  if (type === 'category') {
    return (
      <div onKeyDown={handleKeyDown} onBlur={save}>
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
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={handleKeyDown}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
      inputMode={type === 'amount' ? 'decimal' : undefined}
    />
  )
}
