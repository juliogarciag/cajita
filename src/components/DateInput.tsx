import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { format, parse, isValid } from 'date-fns'
import { useDateFormat } from '#/lib/date-format.js'
import { useDatePickerDropdown } from '#/lib/use-date-picker-dropdown.js'
import 'react-day-picker/style.css'
import './calendar.css'

interface DateInputProps {
  value: string // ISO YYYY-MM-DD
  onChange: (isoDate: string) => void
  className?: string
}

export function DateInput({ value, onChange, className = '' }: DateInputProps) {
  const { dateFnsFormat } = useDateFormat()

  const picker = useDatePickerDropdown({
    value,
    dateFnsFormat,
    initialOpen: false,
    onSelect: onChange,
  })

  // Sync external value changes
  useEffect(() => {
    const d = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
    if (d && isValid(d)) {
      picker.setSelectedDate(d)
      picker.setInputValue(format(d, dateFnsFormat))
      picker.setMonth(d)
    }
  }, [value, dateFnsFormat]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <input
        ref={picker.inputRef}
        type="text"
        value={picker.inputValue}
        onChange={picker.handleInputChange}
        onFocus={() => picker.setIsOpen(true)}
        placeholder={dateFnsFormat}
        className={`rounded border border-gray-300 px-2 py-1.5 text-sm ${className}`}
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
