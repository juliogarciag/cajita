import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import type { WealthSource } from '#/lib/wealth-sources-collection.js'
import type { Reading } from '#/lib/net-worth.js'
import { formatCents, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { defaultReadingLabel, sameMonth } from '#/lib/reading-label.js'
import {
  createBalanceSnapshot,
  updateBalanceSnapshot,
  setBalanceEntry,
} from '#/server/balance-snapshots.js'

interface ReadingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sources: WealthSource[]
  /** Newest first — a new reading is prefilled from the first. */
  readings: Reading[]
  /** The reading being corrected; omitted to record a new one. */
  reading?: Reading | null
  onSaved?: (snapshotId: string) => void
}

const asDollars = (cents: number | undefined) => (cents == null ? '' : (cents / 100).toFixed(2))

/**
 * A reading is a form, not a row.
 *
 * Inline editing suited correcting one cell, but a reading means every source
 * at once — and that grows with the number of accounts. A dialog holds the
 * date, the name and every amount together, whether you're recording a new
 * sweep or fixing an old one.
 */
export function ReadingDialog({
  open,
  onOpenChange,
  sources,
  readings,
  reading = null,
  onSaved,
}: ReadingDialogProps) {
  const editing = reading !== null
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [label, setLabel] = useState('')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const previous = readings[0] ?? null

  // Reopening starts from whatever is being edited, or from today plus the
  // previous reading's figures to correct rather than retype.
  useEffect(() => {
    if (!open) return
    const source = reading ?? previous
    setDate(reading ? reading.snapshot.date : toISODate(new Date()))
    setLabel(reading?.snapshot.label ?? '')
    setSaving(false)
    setAmounts(Object.fromEntries(sources.map((s) => [s.id, asDollars(source?.amounts.get(s.id))])))
    // `previous` is derived from readings; re-running on every render would
    // stomp on typing, so this deliberately keys off `open` and the target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reading?.snapshot.id])

  const placeholder = useMemo(
    () =>
      defaultReadingLabel(
        date,
        readings
          .filter((r) => r.snapshot.id !== reading?.snapshot.id && sameMonth(r.snapshot.date, date))
          .map((r) => r.snapshot.label ?? ''),
      ),
    [date, readings, reading],
  )

  const parsed = sources.map((s) => ({
    source: s,
    raw: amounts[s.id] ?? '',
    cents: (amounts[s.id] ?? '').trim() === '' ? null : parseDollarsTocents(amounts[s.id] ?? ''),
  }))
  const invalid = parsed.filter((p) => p.raw.trim() !== '' && p.cents === null)
  const filled = parsed.filter((p) => p.cents !== null)
  const total = filled.reduce((sum, p) => sum + (p.cents ?? 0), 0)

  const submit = async () => {
    if (saving || invalid.length > 0) return
    setSaving(true)
    try {
      if (reading) {
        await updateBalanceSnapshot({
          data: { id: reading.snapshot.id, date, label: label.trim() || placeholder },
        })
        // Only what actually moved is written — an untouched sweep of twenty
        // accounts shouldn't be twenty writes.
        for (const p of parsed) {
          if (p.cents === reading.amounts.get(p.source.id)) continue
          if (p.cents == null && !reading.amounts.has(p.source.id)) continue
          await setBalanceEntry({
            data: {
              balance_snapshot_id: reading.snapshot.id,
              wealth_source_id: p.source.id,
              amount_usd_cents: p.cents,
            },
          })
        }
        onSaved?.(reading.snapshot.id)
      } else {
        const result = await createBalanceSnapshot({
          data: {
            date,
            label: label.trim() || undefined,
            amounts: filled.map((p) => ({
              wealth_source_id: p.source.id,
              amount_usd_cents: p.cents as number,
            })),
          },
        })
        onSaved?.(result.snapshot.id)
      }
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save the reading')
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
              {editing ? 'Edit reading' : 'Add reading'}
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-xs text-gray-500">
              {editing
                ? 'Correct the date, the name or any balance.'
                : previous
                  ? 'Prefilled from the last reading — correct what changed.'
                  : 'Record what each account holds today.'}
            </Dialog.Description>
          </div>

          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-5 py-4">
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-gray-500">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-[2] flex-col gap-1">
                <span className="text-xs text-gray-500">Name</span>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={placeholder}
                  maxLength={120}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
              {sources.map((s) => (
                <label key={s.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-gray-700">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amounts[s.id] ?? ''}
                    onChange={(e) => setAmounts((a) => ({ ...a, [s.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submit()
                    }}
                    aria-label={s.name}
                    placeholder="—"
                    className="w-36 rounded border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gray-500 focus:outline-none"
                  />
                </label>
              ))}
            </div>

            {sources.length > 0 && (
              <div className="flex items-baseline justify-between border-t border-gray-100 pt-3 text-sm">
                <span className="text-gray-500">
                  {filled.length} of {sources.length} filled
                </span>
                <span className="font-medium tabular-nums text-gray-900">{formatCents(total)}</span>
              </div>
            )}

            {invalid.length > 0 && (
              <p className="text-xs text-red-600">
                {invalid.map((p) => p.source.name).join(', ')}:{' '}
                {invalid.length === 1 ? "that isn't a number" : "those aren't numbers"}
              </p>
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
              disabled={saving || invalid.length > 0}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add reading'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
