import { useCallback } from 'react'
import { toISODate } from '#/lib/format.js'

export interface DateRange {
  from: string
  to: string
}

interface DateRangeFilterProps {
  value: DateRange | null
  onChange: (range: DateRange | null) => void
}

function getPresetRange(preset: string): DateRange | null {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  switch (preset) {
    case 'this-month':
      return {
        from: toISODate(new Date(year, month, 1)),
        to: toISODate(new Date(year, month + 1, 0)),
      }
    case 'last-month':
      return {
        from: toISODate(new Date(year, month - 1, 1)),
        to: toISODate(new Date(year, month, 0)),
      }
    case 'this-year':
      return {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      }
    case 'last-year':
      return {
        from: `${year - 1}-01-01`,
        to: `${year - 1}-12-31`,
      }
    default:
      return null
  }
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const handlePreset = useCallback(
    (preset: string) => {
      onChange(getPresetRange(preset))
    },
    [onChange],
  )

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {['this-month', 'last-month', 'this-year', 'last-year'].map((preset) => (
          <button
            key={preset}
            onClick={() => handlePreset(preset)}
            className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
          >
            {preset
              .split('-')
              .map((w) => w[0].toUpperCase() + w.slice(1))
              .join(' ')}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={value?.from ?? ''}
          onChange={(e) =>
            onChange(e.target.value ? { from: e.target.value, to: value?.to ?? '9999-12-31' } : null)
          }
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <span className="text-xs text-gray-400">to</span>
        <input
          type="date"
          value={value?.to ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value ? { from: value?.from ?? '0000-01-01', to: e.target.value } : null,
            )
          }
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </div>
      {value && (
        <button
          onClick={() => onChange(null)}
          className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Clear
        </button>
      )}
    </div>
  )
}
