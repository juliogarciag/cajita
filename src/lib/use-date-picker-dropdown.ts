import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { format, parse, isValid } from 'date-fns'

/** Approximate height of the DayPicker calendar dropdown */
const DROPDOWN_HEIGHT = 320

function calcDropdownPos(inputEl: HTMLElement, dropdownEl: HTMLElement | null) {
  const rect = inputEl.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const dropdownH = dropdownEl?.offsetHeight ?? DROPDOWN_HEIGHT

  const placeAbove = spaceBelow < dropdownH + 8 && spaceAbove > dropdownH + 8
  return {
    top: placeAbove ? rect.top - dropdownH - 4 : rect.bottom + 4,
    left: rect.left,
  }
}

interface UseDatePickerDropdownOptions {
  /** ISO YYYY-MM-DD string */
  value: string
  /** date-fns format string (e.g. 'dd/MM/yyyy') */
  dateFnsFormat: string
  /** Whether the dropdown starts open */
  initialOpen?: boolean
  /** Called when user picks a date (receives ISO string) */
  onSelect?: (isoDate: string) => void
}

export function useDatePickerDropdown({
  value,
  dateFnsFormat,
  initialOpen = false,
  onSelect,
}: UseDatePickerDropdownOptions) {
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
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [positioned, setPositioned] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })

  // Position synchronously before paint, flipping above if needed
  useLayoutEffect(() => {
    if (isOpen && inputRef.current) {
      setDropdownPos(calcDropdownPos(inputRef.current, dropdownRef.current))
      setPositioned(true)
    } else {
      setPositioned(false)
    }
  }, [isOpen])

  // Re-measure after dropdown renders (real height available)
  useEffect(() => {
    if (isOpen && positioned && inputRef.current && dropdownRef.current) {
      setDropdownPos(calcDropdownPos(inputRef.current, dropdownRef.current))
    }
  }, [isOpen, positioned])

  // Reposition on scroll
  useEffect(() => {
    if (!isOpen) return
    const handler = () => {
      if (inputRef.current) {
        setDropdownPos(calcDropdownPos(inputRef.current, dropdownRef.current))
      }
    }
    window.addEventListener('scroll', handler, { capture: true })
    return () => window.removeEventListener('scroll', handler, { capture: true })
  }, [isOpen])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  const handleDaySelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return
      setSelectedDate(date)
      setMonth(date)
      setInputValue(format(date, dateFnsFormat))
      onSelect?.(format(date, 'yyyy-MM-dd'))
      setIsOpen(false)
    },
    [dateFnsFormat, onSelect],
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

  return {
    inputRef,
    dropdownRef,
    selectedDate,
    month,
    setMonth,
    inputValue,
    isOpen,
    setIsOpen,
    positioned,
    dropdownPos,
    setSelectedDate,
    setInputValue,
    handleDaySelect,
    handleInputChange,
  }
}
