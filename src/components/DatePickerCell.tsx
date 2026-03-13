import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { format, parse, isValid } from 'date-fns'
import { useDateFormat } from '#/lib/date-format.js'
import 'react-day-picker/style.css'
import './calendar.css'

interface DatePickerCellProps {
  value: string // ISO YYYY-MM-DD
  onSave: (isoDate: string) => void
  onCancel: () => void
  onTab?: (shift: boolean) => void
  onEnter?: () => void
}

// Approx height of the DayPicker calendar dropdown
const DROPDOWN_HEIGHT = 320

function calcDropdownPos(inputEl: HTMLElement, dropdownEl: HTMLElement | null) {
  const rect = inputEl.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const dropdownH = dropdownEl?.offsetHeight ?? DROPDOWN_HEIGHT

  // Place above if not enough space below but enough above
  const placeAbove = spaceBelow < dropdownH + 8 && spaceAbove > dropdownH + 8
  return {
    top: placeAbove ? rect.top - dropdownH - 4 : rect.bottom + 4,
    left: rect.left,
  }
}

export function DatePickerCell({ value, onSave, onCancel, onTab, onEnter }: DatePickerCellProps) {
  const { dateFnsFormat } = useDateFormat()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const initialDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    initialDate && isValid(initialDate) ? initialDate : undefined,
  )
  const [month, setMonth] = useState(selectedDate ?? new Date())
  const [inputValue, setInputValue] = useState(
    selectedDate ? format(selectedDate, dateFnsFormat) : '',
  )
  const [open, setOpen] = useState(true)
  const [positioned, setPositioned] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })

  // Position the dropdown synchronously before paint, flipping above if needed
  useLayoutEffect(() => {
    if (open && inputRef.current) {
      setDropdownPos(calcDropdownPos(inputRef.current, dropdownRef.current))
      setPositioned(true)
    } else {
      setPositioned(false)
    }
  }, [open])

  // Re-measure after the dropdown renders (now we have its real height)
  useEffect(() => {
    if (open && positioned && inputRef.current && dropdownRef.current) {
      setDropdownPos(calcDropdownPos(inputRef.current, dropdownRef.current))
    }
  }, [open, positioned])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Close on click outside (check both input and dropdown)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        if (selectedDate) {
          onSave(format(selectedDate, 'yyyy-MM-dd'))
        }
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, selectedDate, onSave])

  // Reposition dropdown on scroll
  useEffect(() => {
    if (!open) return
    const handler = () => {
      if (inputRef.current) {
        setDropdownPos(calcDropdownPos(inputRef.current, dropdownRef.current))
      }
    }
    window.addEventListener('scroll', handler, { capture: true })
    return () => window.removeEventListener('scroll', handler, { capture: true })
  }, [open])

  const handleDaySelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return
      setSelectedDate(date)
      setMonth(date)
      setInputValue(format(date, dateFnsFormat))
      onSave(format(date, 'yyyy-MM-dd'))
      setOpen(false)
    },
    [dateFnsFormat, onSave],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setInputValue(val)
      const parsed = parse(val, dateFnsFormat, new Date())
      if (isValid(parsed) && parsed.getFullYear() > 1999 && parsed.getFullYear() < 2100) {
        setSelectedDate(parsed)
        setMonth(parsed)
      }
    },
    [dateFnsFormat],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        if (selectedDate) {
          onSave(format(selectedDate, 'yyyy-MM-dd'))
        }
        onTab?.(e.shiftKey)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedDate) {
          onSave(format(selectedDate, 'yyyy-MM-dd'))
        }
        onEnter?.()
      }
    },
    [selectedDate, onSave, onCancel, onTab, onEnter],
  )

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={dateFnsFormat}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
      />
      {open &&
        positioned &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleDaySelect}
              month={month}
              onMonthChange={setMonth}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
