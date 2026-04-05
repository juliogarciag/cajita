import { useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import { useDateFormat } from '#/lib/date-format.js'
import { useDatePickerDropdown } from '#/lib/use-date-picker-dropdown.js'
import 'react-day-picker/style.css'
import './calendar.css'

interface DatePickerCellProps {
  value: string // ISO YYYY-MM-DD
  onSave: (isoDate: string) => void
  onCancel: () => void
  onTab?: (shift: boolean) => void
  onEnter?: () => void
}

export function DatePickerCell({ value, onSave, onCancel, onTab, onEnter }: DatePickerCellProps) {
  const { dateFnsFormat } = useDateFormat()
  const savedRef = useRef(false)

  const wrappedOnSave = useCallback(
    (isoDate: string) => {
      if (savedRef.current) return
      savedRef.current = true
      onSave(isoDate)
    },
    [onSave],
  )

  const wrappedOnCancel = useCallback(() => {
    if (savedRef.current) return
    savedRef.current = true
    onCancel()
  }, [onCancel])

  const picker = useDatePickerDropdown({
    value,
    dateFnsFormat,
    initialOpen: true,
    onSelect: wrappedOnSave,
  })

  const handleBlur = useCallback(() => {
    // Small delay to allow click on dropdown calendar to register before blur fires
    setTimeout(() => {
      if (picker.dropdownRef.current?.contains(document.activeElement)) return
      if (picker.inputRef.current?.contains(document.activeElement)) return
      if (picker.selectedDate) {
        wrappedOnSave(format(picker.selectedDate, 'yyyy-MM-dd'))
      } else {
        wrappedOnCancel()
      }
    }, 150)
  }, [picker.selectedDate, picker.dropdownRef, picker.inputRef, wrappedOnSave, wrappedOnCancel])

  // Auto-focus and select on mount
  useEffect(() => {
    picker.inputRef.current?.focus()
    picker.inputRef.current?.select()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        wrappedOnCancel()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        if (picker.selectedDate) {
          wrappedOnSave(format(picker.selectedDate, 'yyyy-MM-dd'))
        }
        onTab?.(e.shiftKey)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (picker.selectedDate) {
          wrappedOnSave(format(picker.selectedDate, 'yyyy-MM-dd'))
        }
        onEnter?.()
      }
    },
    [picker.selectedDate, wrappedOnSave, wrappedOnCancel, onTab, onEnter],
  )

  return (
    <>
      <input
        ref={picker.inputRef}
        type="text"
        value={picker.inputValue}
        onChange={picker.handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={dateFnsFormat}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
      />
      {picker.isOpen &&
        picker.positioned &&
        createPortal(
          <div
            ref={picker.dropdownRef}
            className="fixed z-[9999] rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
            style={{ top: picker.dropdownPos.top, left: picker.dropdownPos.left }}
          >
            <DayPicker
              mode="single"
              selected={picker.selectedDate}
              onSelect={picker.handleDaySelect}
              month={picker.month}
              onMonthChange={picker.setMonth}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
