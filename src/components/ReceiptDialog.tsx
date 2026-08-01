import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import type { IncomeReceipt } from '#/lib/income-receipts-collection.js'
import { formatMonth } from '#/lib/income-tax-year.js'
import { formatSoles, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { createIncomeReceipt, updateIncomeReceipt } from '#/server/income-tax.js'

interface ReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The receipt being corrected; omitted to add a new one. */
  receipt?: IncomeReceipt | null
  /** Prefills for a new receipt, taken from the most recent one. */
  suggestedCompany: string
  suggestedReceiptNumber: string
  suggestedUsdCents: number | null
  /** Months that already have a retention, so the footer can say so. */
  coveredMonths: string[]
  /** The year being viewed — a new receipt defaults into it. */
  year: number
}

/**
 * A receipt is a form, not a row.
 *
 * Seven fields belong to one record, and the soles amount falls out of two of
 * them. Entering it inline would also mean a half-typed row sitting in the
 * ledger, dragging the year's tax and bracket figures through wrong values on
 * every keystroke.
 */
export function ReceiptDialog({
  open,
  onOpenChange,
  receipt = null,
  suggestedCompany,
  suggestedReceiptNumber,
  suggestedUsdCents,
  coveredMonths,
  year,
}: ReceiptDialogProps) {
  const editing = receipt !== null
  const [incomeDate, setIncomeDate] = useState('')
  const [receiptDate, setReceiptDate] = useState('')
  const [description, setDescription] = useState('')
  const [company, setCompany] = useState('')
  const [receiptNumber, setReceiptNumber] = useState('')
  const [usd, setUsd] = useState('')
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)

  // Reopening starts from whatever is being edited, or from today in the year
  // being viewed, prefilled from the last receipt so only the rate changes.
  useEffect(() => {
    if (!open) return
    setSaving(false)
    const today = toISODate(new Date())
    const fallback = today.startsWith(String(year)) ? today : `${year}-12-31`
    setIncomeDate(receipt?.income_date ?? fallback)
    setReceiptDate(receipt?.receipt_date ?? fallback)
    setDescription(receipt?.description ?? '')
    setCompany(receipt?.company ?? suggestedCompany)
    setReceiptNumber(receipt?.receipt_number ?? suggestedReceiptNumber)
    setUsd(
      receipt
        ? (receipt.amount_usd_cents / 100).toFixed(2)
        : suggestedUsdCents != null
          ? (suggestedUsdCents / 100).toFixed(2)
          : '',
    )
    setRate(receipt ? String(receipt.exchange_rate) : '')
    // Deliberately keyed off `open` and the target so it doesn't stomp typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receipt?.id])

  const usdCents = usd.trim() === '' ? null : parseDollarsTocents(usd)
  const parsedRate = rate.trim() === '' ? null : Number(rate.replace(/[^\d.]/g, ''))
  const rateValid = parsedRate !== null && Number.isFinite(parsedRate) && parsedRate > 0
  const usdValid = usdCents !== null && usdCents > 0

  const solesCents = usdValid && rateValid ? Math.round(usdCents * parsedRate) : null
  const month = /^\d{4}-\d{2}-\d{2}$/.test(receiptDate) ? receiptDate.slice(0, 7) : null
  const monthCovered = month !== null && coveredMonths.includes(month)

  const problems: string[] = []
  if (usd.trim() !== '' && !usdValid) problems.push('the amount')
  if (rate.trim() !== '' && !rateValid) problems.push('the rate')

  const canSave = usdValid && rateValid && description.trim() !== '' && month !== null

  const submit = async () => {
    if (saving || !canSave) return
    setSaving(true)
    try {
      const payload = {
        income_date: incomeDate,
        receipt_date: receiptDate,
        description: description.trim(),
        company: company.trim(),
        receipt_number: receiptNumber.trim(),
        amount_usd_cents: usdCents as number,
        exchange_rate: parsedRate as number,
      }
      if (receipt) {
        await updateIncomeReceipt({ data: { id: receipt.id, ...payload } })
      } else {
        await createIncomeReceipt({ data: payload })
      }
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save the receipt')
      setSaving(false)
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl ring-1 ring-black/5 outline-none">
          <div className="border-b border-gray-200 px-5 py-3">
            <Dialog.Title className="text-sm font-medium text-gray-900">
              {editing ? 'Edit receipt' : 'Add receipt'}
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-xs text-gray-500">
              What you invoiced. Soles are computed from the rate — you never type them.
            </Dialog.Description>
          </div>

          <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-5 py-4">
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-gray-500">Income date</span>
                <input
                  type="date"
                  value={incomeDate}
                  onChange={(e) => setIncomeDate(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-gray-500">Receipt date</span>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Description</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={onEnter}
                placeholder="Sueldo de Julio"
                maxLength={255}
                autoFocus
                className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
              />
            </label>

            <div className="flex gap-3">
              <label className="flex flex-[2] flex-col gap-1">
                <span className="text-xs text-gray-500">Company</span>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  onKeyDown={onEnter}
                  maxLength={255}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-gray-500">Receipt number</span>
                <input
                  type="text"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  onKeyDown={onEnter}
                  maxLength={64}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm tabular-nums focus:border-gray-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-gray-500">Amount (USD)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={usd}
                  onChange={(e) => setUsd(e.target.value)}
                  onKeyDown={onEnter}
                  placeholder="0.00"
                  className="rounded border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gray-500 focus:outline-none"
                />
              </label>
              <label className="flex w-28 flex-col gap-1">
                <span className="text-xs text-gray-500">Rate</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  onKeyDown={onEnter}
                  placeholder="3.4100"
                  className="rounded border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gray-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-baseline justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-500">Amount in soles</span>
              <span className="text-sm font-medium tabular-nums text-gray-900">
                {solesCents === null ? '—' : formatSoles(solesCents)}
              </span>
            </div>

            {problems.length > 0 && (
              <p className="text-xs text-red-600">
                {problems.join(' and ')} {problems.length === 1 ? "isn't" : "aren't"} a positive
                number.
              </p>
            )}

            {month !== null && (
              <p
                className={`rounded-md px-3 py-2 text-xs leading-relaxed ${
                  monthCovered ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'
                }`}
              >
                Lands in <span className="font-medium">{formatMonth(month)}</span>
                {monthCovered
                  ? ' — that month already has a retention logged'
                  : ' — no retention logged for that month yet'}
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
              disabled={saving || !canSave}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add receipt'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
