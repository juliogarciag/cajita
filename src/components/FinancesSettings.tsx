import { useState } from 'react'
import { useRouteContext, useRouter } from '@tanstack/react-router'
import { useDateFormat } from '#/lib/date-format.js'
import { updateDisplayName } from '#/server/profile.js'
import type { DateFormatOption } from '#/lib/format.js'

const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string; example: string }[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '15/02/2026' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2026-02-15' },
]

function DisplayName() {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const router = useRouter()
  const [value, setValue] = useState(user.displayName ?? '')
  const [saving, setSaving] = useState(false)

  const trimmed = value.trim()
  const dirty = trimmed !== (user.displayName ?? '')

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await updateDisplayName({ data: { display_name: trimmed } })
      // The header reads the name off the route context, which is only
      // resolved on load — re-run it so the change shows without a refresh.
      await router.invalidate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-sm font-medium text-gray-900">Display name</h2>
      <p className="mb-4 text-sm text-gray-500">
        Leave empty to use your Google name
        {user.googleName ? <span className="text-gray-400"> ({user.googleName})</span> : null}.
      </p>
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
          }}
          maxLength={120}
          placeholder={user.googleName ?? 'Your name'}
          aria-label="Display name"
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        <button
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export function FinancesSettings() {
  const { dateFormat, setDateFormat } = useDateFormat()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <DisplayName />

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-gray-900">Date Format</h2>
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
