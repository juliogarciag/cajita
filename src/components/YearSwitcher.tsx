import { ChevronLeft, ChevronRight } from 'lucide-react'

interface YearSwitcherProps {
  /** Newest first; must contain `selected` so the active option exists. */
  years: number[]
  selected: number
  onSelect: (year: number) => void
}

/**
 * Constant-width year control: arrows for the adjacent-year hop, a dropdown
 * for longer jumps. Stays the same size however many years pile up.
 */
export function YearSwitcher({ years, selected, onSelect }: YearSwitcherProps) {
  const index = years.indexOf(selected)
  const olderYear = index < years.length - 1 ? years[index + 1] : null
  const newerYear = index > 0 ? years[index - 1] : null

  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-gray-200 text-xs">
      <button
        onClick={() => olderYear != null && onSelect(olderYear)}
        disabled={olderYear == null}
        title={olderYear != null ? `Go to ${olderYear}` : 'No earlier year'}
        aria-label="Previous year"
        className="px-1.5 py-1 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronLeft size={14} />
      </button>
      <select
        value={selected}
        onChange={(e) => onSelect(Number(e.target.value))}
        aria-label="Year"
        className="cursor-pointer border-x border-gray-200 bg-white px-2 py-1 font-medium text-gray-900 focus:outline-none"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button
        onClick={() => newerYear != null && onSelect(newerYear)}
        disabled={newerYear == null}
        title={newerYear != null ? `Go to ${newerYear}` : 'No later year'}
        aria-label="Next year"
        className="px-1.5 py-1 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
