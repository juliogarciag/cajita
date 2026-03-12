import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker, getDefaultClassNames } from 'react-day-picker'
import { format, parse, isValid } from 'date-fns'
import { useDateFormat } from '#/lib/date-format.js'
import 'react-day-picker/style.css'

interface DateInputProps {
  value: string // ISO YYYY-MM-DD
  onChange: (isoDate: string) => void
  className?: string
}

const DROPDOWN_HEIGHT = 320

function calcDropdownPos(inputEl: HTMLElement, dropdownEl: HTMLElement | null) {
  const rect = inputEl.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const dropdownH = dropdownEl?.offsetHeight ?? DROPDOWN_HEIGHT
  const placeAbove = spaceBelow < dropdownH + 8 && rect.top > dropdownH + 8
  return {
    top: placeAbove ? rect.top - dropdownH - 4 : rect.bottom + 4,
    left: rect.left,
  }
}

export function DateInput({ value, onChange, className = '' }: DateInputProps) {
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
  const [open, setOpen] = useState(false)
  const [positioned, setPositioned] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })

  // Sync external value changes
  useEffect(() => {
    const d = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
    if (d && isValid(d)) {
      setSelectedDate(d)
      setInputValue(format(d, dateFnsFormat))
      setMonth(d)
    }
  }, [value, dateFnsFormat])

  useLayoutEffect(() => {
    if (open && inputRef.current) {
      setDropdownPos(calcDropdownPos(inputRef.current, dropdownRef.current))
      setPositioned(true)
    } else {
      setPositioned(false)
    }
  }, [open])

  useEffect(() => {
    if (open && positioned && inputRef.current && dropdownRef.current) {
      setDropdownPos(calcDropdownPos(inputRef.current, dropdownRef.current))
    }
  }, [open, positioned])

  // Close on click outside
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
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

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
      onChange(format(date, 'yyyy-MM-dd'))
      setOpen(false)
    },
    [dateFnsFormat, onChange],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setInputValue(val)
      const parsed = parse(val, dateFnsFormat, new Date())
      if (isValid(parsed) && parsed.getFullYear() > 1999 && parsed.getFullYear() < 2100) {
        setSelectedDate(parsed)
        setMonth(parsed)
        onChange(format(parsed, 'yyyy-MM-dd'))
      }
    },
    [dateFnsFormat, onChange],
  )

  const defaultClassNames = getDefaultClassNames()

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        placeholder={dateFnsFormat}
        className={`rounded border border-gray-300 px-2 py-1.5 text-sm ${className}`}
      />
      {open &&
        positioned &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] rounded-lg border border-gray-200 bg-white p-2 shadow-xl"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleDaySelect}
              month={month}
              onMonthChange={setMonth}
              classNames={{
                root: `${defaultClassNames.root} text-sm`,
                today: 'font-bold text-blue-600',
                selected: 'bg-gray-900 text-white rounded-full',
                chevron: `${defaultClassNames.chevron} fill-gray-600`,
              }}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
