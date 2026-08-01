import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import type { TaxRetention } from '#/lib/tax-retentions-collection.js'
import { formatMonth, receiptSolesCents, type MonthCoverage } from '#/lib/income-tax-year.js'
import { formatSoles, parseDollarsTocents } from '#/lib/format.js'
import { createTaxRetention, updateTaxRetention } from '#/server/income-tax.js'

interface RetentionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The retention being corrected; omitted to log a new one. */
  retention?: TaxRetention | null
  /** Every month in the year that holds receipts or a retention. */
  coverage: MonthCoverage[]
  year: number
}

/**
 * You pick a month, not receipts.
 *
 * Which receipts a retention covers comes from their dates, so a month holding
 * two of them is covered by one figure without anything being tagged. The
 * implied rate is shown because a wildly wrong entry is worth noticing, but it
 * never blocks the save: the amount is whatever SUNAT's portal charged, fees for
 * prior years included, so "not 8%" is regularly the correct answer.
 */
export function RetentionDialog({
  open,
  onOpenChange,
  retention = null,
  coverage,
  year,
}: RetentionDialogProps) {
  const editing = retention !== null
  const [month, setMonth] = useState('')
  const [soles, setSoles] = useState('')
  const [usd, setUsd] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Months worth offering: those with receipts and nothing logged yet. The one
  // being edited stays in the list so its own month isn't missing from it.
  const options = useMemo(() => {
    const open = coverage
      .filter((c) => c.receipts.length > 0 && c.retention === null)
      .map((c) => c.month)
    if (retention && !open.includes(retention.month)) open.push(retention.month)
    return open.sort((a, b) => b.localeCompare(a))
  }, [coverage, retention])

  useEffect(() => {
    if (!open) return
    setSaving(false)
    setMonth(retention?.month ?? options[0] ?? `${year}-01`)
    setSoles(retention ? (retention.amount_soles_cents / 100).toFixed(2) : '')
    setUsd(retention?.amount_usd_cents != null ? (retention.amount_usd_cents / 100).toFixed(2) : '')
    setNote(retention?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retention?.id])

  const selected = coverage.find((c) => c.month === month) ?? null
  const receipts = selected?.receipts ?? []
  const incomeCovered = selected?.incomeSolesExact ?? 0

  const solesCents = soles.trim() === '' ? null : parseDollarsTocents(soles)
  const usdCents = usd.trim() === '' ? null : parseDollarsTocents(usd)
  const solesValid = solesCents !== null
  const usdValid = usd.trim() === '' || usdCents !== null

  const impliedRate =
    solesValid && incomeCovered > 0 ? (solesCents as number) / 100 / incomeCovered : null

  const canSave = solesValid && usdValid && /^\d{4}-\d{2}$/.test(month)

  const submit = async () => {
    if (saving || !canSave) return
    setSaving(true)
    try {
      const payload = {
        month,
        amount_soles_cents: solesCents as number,
        amount_usd_cents: usdCents,
        note: note.trim(),
      }
      if (retention) {
        await updateTaxRetention({ data: { id: retention.id, ...payload } })
      } else {
        await createTaxRetention({ data: payload })
      }
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save the retention')
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl ring-1 ring-black/5 outline-none">
          <div className="border-b border-gray-200 px-5 py-3">
            <Dialog.Title className="text-sm font-medium text-gray-900">
              {editing ? 'Edit retention' : 'Add retention'}
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-xs text-gray-500">
              What SUNAT&rsquo;s portal charged you. Enter the figure they gave — nothing here is
              calculated.
            </Dialog.Description>
          </div>

          <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-5 py-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Month</span>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
              >
                {options.length === 0 && <option value={month}>{formatMonth(month)}</option>}
                {options.map((m) => (
                  <option key={m} value={m}>
                    {formatMonth(m)}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-400">
                {options.length === 0
                  ? 'Every month with receipts already has one'
                  : 'Only months with receipts and no retention yet'}
              </span>
            </label>

            <div className="flex flex-col gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2 text-xs text-gray-400">
                <span>
                  {receipts.length === 0
                    ? 'Covers no receipts'
                    : `Covers ${receipts.length} ${receipts.length === 1 ? 'receipt' : 'receipts'}`}
                </span>
                <span className="tabular-nums">{formatSoles(Math.round(incomeCovered * 100))}</span>
              </div>
              {receipts.map((r) => (
                <div
                  key={r.id}
                  className="flex items-baseline justify-between gap-3 text-xs tabular-nums text-gray-700"
                >
                  <span className="truncate">
                    <span className="font-medium">{r.receipt_number || '—'}</span>{' '}
                    <span className="text-gray-400">{r.description}</span>
                  </span>
                  <span className="shrink-0">{formatSoles(receiptSolesCents(r))}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-gray-500">Soles charged</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={soles}
                  onChange={(e) => setSoles(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit()
                  }}
                  placeholder="0.00"
                  autoFocus
                  className="rounded border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gray-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-gray-500">
                  USD paid <span className="text-gray-400">optional</span>
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={usd}
                  onChange={(e) => setUsd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit()
                  }}
                  placeholder="—"
                  className="rounded border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gray-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-baseline justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-500">
                Implied rate — for your eyes, not a rule
              </span>
              <span className="text-sm font-medium tabular-nums text-gray-900">
                {impliedRate === null ? '—' : `${(impliedRate * 100).toFixed(2)}%`}
              </span>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">
                Note <span className="text-gray-400">optional</span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. includes fees for prior years"
                maxLength={500}
                rows={2}
                className="resize-y rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
              />
            </label>

            {!solesValid && soles.trim() !== '' && (
              <p className="text-xs text-red-600">That amount isn&rsquo;t a number.</p>
            )}
            {!usdValid && (
              <p className="text-xs text-red-600">That dollar amount isn&rsquo;t a number.</p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
            <Dialog.Close asChild>
              <button className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={() => void submit()}
              disabled={saving || !canSave}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add retention'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
