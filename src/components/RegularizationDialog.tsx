import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { formatCents, formatSoles, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { setTaxYearSettings } from '#/server/income-tax.js'

interface RegularizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  /** Already settled, so the dialog opens on those figures and can clear them. */
  paidOn: string | null
  paidSolesCents: number | null
  paidUsdCents: number | null
  /** What the app worked out, used to prefill and to show a discrepancy. */
  computedSolesCents: number | null
  computedUsdCents: number | null
}

/**
 * Records that a year's regularization was actually paid.
 *
 * The amount is asked for rather than assumed: the portal's figure at filing
 * time can carry late interest or fees for earlier years, and the same rule
 * holds here as everywhere else — SUNAT says, we log it. Leaving it blank is
 * fine when the computed figure is what was paid.
 */
export function RegularizationDialog({
  open,
  onOpenChange,
  year,
  paidOn,
  paidSolesCents,
  paidUsdCents,
  computedSolesCents,
  computedUsdCents,
}: RegularizationDialogProps) {
  const settled = paidOn !== null
  const [date, setDate] = useState('')
  const [soles, setSoles] = useState('')
  const [usd, setUsd] = useState('')
  const [saving, setSaving] = useState(false)

  const asAmount = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(2))

  useEffect(() => {
    if (!open) return
    setSaving(false)
    setDate(paidOn ?? toISODate(new Date()))
    setSoles(asAmount(paidSolesCents ?? computedSolesCents))
    setUsd(asAmount(paidUsdCents ?? computedUsdCents))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paidOn])

  const solesCents = soles.trim() === '' ? null : parseDollarsTocents(soles)
  const usdCents = usd.trim() === '' ? null : parseDollarsTocents(usd)
  const solesValid = soles.trim() === '' || solesCents !== null
  const usdValid = usd.trim() === '' || usdCents !== null
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const canSave = solesValid && usdValid && dateValid

  const differs =
    solesCents !== null && computedSolesCents !== null && solesCents !== computedSolesCents

  const save = async () => {
    if (saving || !canSave) return
    setSaving(true)
    try {
      await setTaxYearSettings({
        data: {
          year,
          regularization_paid_on: date,
          regularization_paid_soles_cents: solesCents,
          regularization_paid_usd_cents: usdCents,
        },
      })
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to record the payment')
      setSaving(false)
    }
  }

  const clear = async () => {
    if (saving) return
    setSaving(true)
    try {
      await setTaxYearSettings({
        data: {
          year,
          regularization_paid_on: null,
          regularization_paid_soles_cents: null,
          regularization_paid_usd_cents: null,
        },
      })
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear the payment')
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
              {settled ? `Edit the ${year} regularization` : `Record the ${year} regularization`}
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-xs text-gray-500">
              SUNAT&rsquo;s final settlement for the year, paid after the annual filing. Record what
              you actually paid — leave the amounts as they are if the figures below are what the
              portal charged.
            </Dialog.Description>
          </div>

          {/* Fields are sized to what goes in them. Stretched across the dialog,
              an eight-digit amount sat in a 400px box with the caret marooned at
              one end — the width promised an input that wasn't coming. */}
          <div className="flex flex-col gap-3 px-5 py-4">
            <div className="flex flex-wrap gap-3">
              <label className="flex w-36 flex-col gap-1">
                <span className="text-xs text-gray-500">Paid on</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                />
              </label>
              <label className="flex w-28 flex-col gap-1">
                <span className="text-xs text-gray-500">Soles paid</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={soles}
                  onChange={(e) => setSoles(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save()
                  }}
                  placeholder="—"
                  autoFocus
                  className="rounded border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gray-500 focus:outline-none"
                />
              </label>
              <label className="flex w-28 flex-col gap-1">
                <span className="flex items-baseline gap-1 text-xs text-gray-500">
                  USD paid <span className="text-[10px] text-gray-400">optional</span>
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={usd}
                  onChange={(e) => setUsd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save()
                  }}
                  placeholder="—"
                  className="rounded border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gray-500 focus:outline-none"
                />
              </label>
            </div>

            {computedSolesCents !== null && (
              <div className="flex items-baseline justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="text-xs whitespace-nowrap text-gray-500">
                  Computed regularization
                </span>
                <span className="text-sm font-medium tabular-nums text-gray-900">
                  {formatSoles(computedSolesCents)}
                  {computedUsdCents !== null && (
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      {formatCents(computedUsdCents)}
                    </span>
                  )}
                </span>
              </div>
            )}

            {differs && (
              <p className="text-xs leading-relaxed text-gray-500">
                That&rsquo;s different from the computed figure, which is normal once late interest
                or fees for earlier years are in there. Both are kept.
              </p>
            )}

            {!dateValid && <p className="text-xs text-red-600">Pick the date it was paid.</p>}
            {!solesValid && (
              <p className="text-xs text-red-600">That amount isn&rsquo;t a number.</p>
            )}
            {!usdValid && (
              <p className="text-xs text-red-600">That dollar amount isn&rsquo;t a number.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-3">
            {settled ? (
              <button
                onClick={() => void clear()}
                disabled={saving}
                className="rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-40"
              >
                Clear the payment
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => void save()}
                disabled={saving || !canSave}
                className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Saving…' : settled ? 'Save changes' : 'Record payment'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
