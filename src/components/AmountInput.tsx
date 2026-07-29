import { useState, useRef, useEffect, useCallback } from 'react'

interface AmountInputProps {
  value: string
  /**
   * Starting text when nothing is stored yet — the previous reading's figure.
   * Deliberately not folded into `value`: `save()` compares the draft against
   * `value` to decide whether anything changed, so a carried figure passed as
   * `value` would look unchanged and silently cancel instead of saving.
   */
  carried?: string
  onSave: (raw: string) => void
  onCancel: () => void
  onTab?: (shift: boolean) => void
  onEnter?: () => void
  className?: string
}

/** Strips currency symbols and formatting, keeping only digits, dots, and minus signs. */
function stripFormatting(v: string): string {
  return v.replace(/[^0-9.\-]/g, '')
}

export function AmountInput({
  value,
  carried,
  onSave,
  onCancel,
  onTab,
  onEnter,
  className = '',
}: AmountInputProps) {
  const [draft, setDraft] = useState(() => stripFormatting(value || carried || ''))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const save = useCallback(() => {
    const stripped = stripFormatting(value)
    if (draft !== stripped) {
      onSave(draft)
    } else {
      onCancel()
    }
  }, [draft, value, onSave, onCancel])

  /**
   * Blur is not a commit for an untouched suggestion. A carried figure seeds
   * the input, so clicking away from a cell you never typed in would otherwise
   * store last month's number — the exact silent carry-forward the drafts are
   * meant to avoid. Tab and Enter still commit it deliberately.
   */
  const handleBlur = useCallback(() => {
    const untouched = !value && carried != null && draft === stripFormatting(carried)
    if (untouched) onCancel()
    else save()
  }, [value, carried, draft, save, onCancel])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(stripFormatting(e.target.value))
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        save()
        onTab?.(e.shiftKey)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        save()
        onEnter?.()
        return
      }
      const allowed = /^[0-9.\-]$/
      if (
        !allowed.test(e.key) &&
        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault()
      }
    },
    [save, onCancel, onTab, onEnter],
  )

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      inputMode="decimal"
      className={`w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none ${className}`}
    />
  )
}
