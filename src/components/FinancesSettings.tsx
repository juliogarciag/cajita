import { useDateFormat } from '#/lib/date-format.js'
import type { DateFormatOption } from '#/lib/format.js'

const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string; example: string }[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '15/02/2026' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2026-02-15' },
]

export function FinancesSettings() {
  const { dateFormat, setDateFormat } = useDateFormat()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-medium text-gray-900">Date Format</h2>
        <p className="mb-4 text-sm text-gray-500">
          Choose how dates are displayed throughout Finances.
        </p>
        <div className="flex gap-3">
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDateFormat(opt.value)}
              className={`flex flex-col items-center rounded-lg border-2 px-6 py-3 text-sm transition-colors ${
                dateFormat === opt.value
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <span className="font-medium text-gray-900">{opt.label}</span>
              <span className="mt-1 text-xs text-gray-500">{opt.example}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
