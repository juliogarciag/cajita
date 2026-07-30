import { useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Plus, StickyNote, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { incomeReceiptsCollection, type IncomeReceipt } from '#/lib/income-receipts-collection.js'
import { taxRetentionsCollection, type TaxRetention } from '#/lib/tax-retentions-collection.js'
import { taxYearsCollection } from '#/lib/tax-years-collection.js'
import {
  compareReceiptNumbers,
  formatMonth,
  nextReceiptNumber,
  normalizeRate,
  normalizeReceipt,
  receiptSolesCents,
  taxYearSummary,
  type MonthCoverage,
} from '#/lib/income-tax-year.js'
import { headroomInCurrentBracket } from '#/lib/income-tax.js'
import { formatCents, formatSoles } from '#/lib/format.js'
import { useDateFormat } from '#/lib/date-format.js'
import { deleteIncomeReceipt, deleteTaxRetention, setTaxYearSettings } from '#/server/income-tax.js'
import { YearSwitcher } from './YearSwitcher.js'
import { ConfirmButton } from './ConfirmButton.js'
import { Tooltip } from './Tooltip.js'
import { ReceiptDialog } from './ReceiptDialog.js'
import { RetentionDialog } from './RetentionDialog.js'

export function IncomeTaxPage() {
  const { formatDate } = useDateFormat()
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [receiptDialog, setReceiptDialog] = useState<{
    open: boolean
    receipt: IncomeReceipt | null
  }>({ open: false, receipt: null })
  const [retentionDialog, setRetentionDialog] = useState<{
    open: boolean
    retention: TaxRetention | null
  }>({ open: false, retention: null })
  const [bracketsOpen, setBracketsOpen] = useState(false)
  const [rateDraft, setRateDraft] = useState<string | null>(null)

  const { data: syncedReceipts } = useLiveQuery((q) =>
    q.from({ r: incomeReceiptsCollection }).orderBy(({ r }) => r.receipt_date, 'asc'),
  )
  // Normalised once, here, because `exchange_rate` reaches us as a string.
  const allReceipts = useMemo(() => syncedReceipts.map(normalizeReceipt), [syncedReceipts])
  const { data: allRetentions } = useLiveQuery((q) =>
    q.from({ t: taxRetentionsCollection }).orderBy(({ t }) => t.month, 'asc'),
  )
  const { data: taxYears } = useLiveQuery((q) => q.from({ y: taxYearsCollection }))

  const yearSettings = taxYears.find((y) => y.year === selectedYear) ?? null
  const regularizationRate = normalizeRate(yearSettings?.regularization_rate)

  // The tax year is read off the receipt date, the same date that decides the
  // declaration month, so a receipt and its retention can never land in
  // different years. Two receipts routinely share that date — a month's salary
  // and the previous one, invoiced together — so income date and then receipt
  // number settle the order the way the sheet reads.
  const receipts = useMemo(
    () =>
      allReceipts
        .filter((r) => r.receipt_date.slice(0, 4) === String(selectedYear))
        .sort(
          (a, b) =>
            a.receipt_date.localeCompare(b.receipt_date) ||
            a.income_date.localeCompare(b.income_date) ||
            compareReceiptNumbers(a.receipt_number, b.receipt_number),
        ),
    [allReceipts, selectedYear],
  )
  const retentions = useMemo(
    () => allRetentions.filter((t) => t.month.slice(0, 4) === String(selectedYear)),
    [allRetentions, selectedYear],
  )

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear, selectedYear])
    for (const r of allReceipts) years.add(Number(r.receipt_date.slice(0, 4)))
    for (const t of allRetentions) years.add(Number(t.month.slice(0, 4)))
    return [...years].sort((a, b) => b - a)
  }, [allReceipts, allRetentions, currentYear, selectedYear])

  const summary = useMemo(
    () =>
      taxYearSummary(receipts, retentions, selectedYear, {
        regularizationRate,
        uitOverride: yearSettings?.uit_override ?? null,
      }),
    [receipts, retentions, selectedYear, regularizationRate, yearSettings],
  )

  const headroom = summary.tax ? headroomInCurrentBracket(summary.tax) : null
  const coveredMonths = retentions.map((t) => t.month)
  // Prefills come from the highest-numbered receipt, not the latest-dated one:
  // a back-dated correction shouldn't decide what the next number is.
  const lastReceipt = useMemo(
    () =>
      allReceipts.reduce<(typeof allReceipts)[number] | null>(
        (best, r) =>
          best === null || compareReceiptNumbers(r.receipt_number, best.receipt_number) > 0
            ? r
            : best,
        null,
      ),
    [allReceipts],
  )

  const monthOfReceipt = (receipt: IncomeReceipt) => receipt.receipt_date.slice(0, 7)
  const retentionByMonth = new Map(retentions.map((t) => [t.month, t]))

  const saveRate = async (raw: string) => {
    setRateDraft(null)
    const trimmed = raw.trim()
    const parsed = trimmed === '' ? null : Number(trimmed.replace(/[^\d.]/g, ''))
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
      toast.error('That rate isn’t a positive number.')
      return
    }
    if (parsed === regularizationRate) return
    try {
      await setTaxYearSettings({ data: { year: selectedYear, regularization_rate: parsed } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save the rate')
    }
  }

  const removeReceipt = async (id: string) => {
    try {
      await deleteIncomeReceipt({ data: { id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete the receipt')
    }
  }

  const removeRetention = async (id: string) => {
    try {
      await deleteTaxRetention({ data: { id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete the retention')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Income tax</h1>
        <div className="flex items-center gap-2">
          <YearSwitcher years={availableYears} selected={selectedYear} onSelect={setSelectedYear} />
          <button
            onClick={() => setRetentionDialog({ open: true, retention: null })}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Plus size={16} />
            Retention
          </button>
          <button
            onClick={() => setReceiptDialog({ open: true, receipt: null })}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus size={16} />
            Add receipt
          </button>
        </div>
      </div>

      {/* Summary: what SUNAT sees, and what it costs */}
      <div className="grid grid-cols-1 rounded-lg border border-gray-200 bg-white md:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-2.5 border-b border-gray-200 p-4 md:border-b-0 md:border-r">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">
              What SUNAT sees · soles
            </span>
            <span className="text-xs text-gray-400">
              {summary.uit === null
                ? `UIT ${selectedYear} not published`
                : `UIT ${selectedYear} · ${formatSoles(summary.uit * 100)}`}
            </span>
          </div>

          <Line
            label="Income received"
            value={formatSoles(Math.round(summary.grossSolesExact * 100))}
          />
          <Line label="Retained through the year" value={formatSoles(summary.retainedSolesCents)} />
          {summary.tax && (
            <Line
              muted
              label="Deductions applied (20%, then 7 UIT)"
              value={`−${formatSoles(
                (summary.tax.firstDeductionSoles + summary.tax.secondDeductionSoles) * 100,
              )}`}
            />
          )}

          <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2.5">
            <span className="text-sm font-medium text-gray-700">
              Tax owed for {selectedYear}
              {summary.tax && (
                <button
                  type="button"
                  aria-expanded={bracketsOpen}
                  onClick={() => setBracketsOpen((v) => !v)}
                  className="ml-1.5 rounded border border-gray-200 px-1.5 py-px align-baseline text-[10.5px] font-medium text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700"
                >
                  brackets {bracketsOpen ? '⌃' : '⌄'}
                </button>
              )}
            </span>
            <span className="text-lg font-medium tabular-nums text-gray-900">
              {summary.tax === null ? '—' : formatSoles(summary.tax.totalTaxSoles * 100)}
            </span>
          </div>

          {bracketsOpen && summary.tax && (
            <div className="flex flex-col rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
              <span className="pb-1.5 text-[10.5px] tabular-nums text-gray-400">
                Taxable base {formatSoles(Math.round(summary.tax.taxableBaseSoles * 100))} after
                deductions
              </span>
              {summary.tax.brackets.map((bracket, index) => {
                const filled =
                  bracket.widthSoles === null
                    ? bracket.taxableSoles > 0
                      ? 1
                      : 0
                    : bracket.taxableSoles / bracket.widthSoles
                return (
                  <div
                    key={bracket.ratePercent}
                    className={`grid grid-cols-[34px_minmax(50px,1fr)_82px] items-center gap-2.5 py-1 text-xs ${
                      index > 0 ? 'border-t border-gray-200' : ''
                    }`}
                  >
                    <span className="font-medium tabular-nums text-gray-700">
                      {bracket.ratePercent}%
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-gray-200">
                      <span
                        className={`block h-full rounded-full ${
                          bracket.widthSoles === null ? 'bg-gray-900' : 'bg-slate-600'
                        }`}
                        style={{ width: `${Math.round(filled * 100)}%` }}
                      />
                    </span>
                    <span className="text-right font-medium tabular-nums text-gray-900">
                      {bracket.taxSoles === 0 ? '—' : formatSoles(bracket.taxSoles * 100)}
                    </span>
                  </div>
                )
              })}
              {headroom && (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                  <span className="font-medium tabular-nums">
                    {formatSoles(Math.round(headroom.headroomSoles * 100))}
                  </span>{' '}
                  of headroom left in the {headroom.ratePercent}% bracket — income past that is
                  taxed at {headroom.nextRatePercent}%.
                </p>
              )}
            </div>
          )}

          <Line
            label="Regularization"
            value={
              summary.regularizationSolesCents === null
                ? '—'
                : formatSoles(summary.regularizationSolesCents)
            }
          />
          {summary.tax && (
            <Line
              muted
              label="Tax as a share of income"
              value={`${(summary.tax.effectiveRate * 100).toFixed(2)}%`}
            />
          )}
        </div>

        <div className="flex flex-col gap-2.5 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">
              What it cost you · dollars
            </span>
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              rate
              <input
                type="text"
                inputMode="decimal"
                aria-label="Exchange rate for the regularization"
                value={rateDraft ?? regularizationRate ?? ''}
                onChange={(e) => setRateDraft(e.target.value)}
                onBlur={(e) => void saveRate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setRateDraft(null)
                }}
                placeholder="3.4800"
                className="w-16 rounded border border-gray-200 px-1.5 py-0.5 text-right text-xs tabular-nums text-gray-900 focus:border-gray-400 focus:outline-none"
              />
            </label>
          </div>

          <Line label="Income received" value={formatCents(summary.grossUsdCents)} />
          <Line label="Already retained" value={formatCents(summary.retainedUsdCents)} />
          <Line
            label="Regularization"
            value={
              summary.regularizationUsdCents === null
                ? '—'
                : formatCents(summary.regularizationUsdCents)
            }
          />

          <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2.5">
            <span className="text-sm font-medium text-gray-700">True cost of {selectedYear}</span>
            <span className="text-lg font-medium tabular-nums text-gray-900">
              {summary.trueCostUsdCents === null ? '—' : formatCents(summary.trueCostUsdCents)}
            </span>
          </div>
          <Line
            label="Effective rate"
            value={
              summary.effectiveUsdRate === null
                ? '—'
                : `${(summary.effectiveUsdRate * 100).toFixed(2)}%`
            }
          />
          {summary.regularizationRate === null && summary.regularizationSolesCents !== null && (
            <p className="text-xs text-gray-400">
              Set a rate to see the regularization in dollars.
            </p>
          )}
          {summary.uncoveredMonths.length > 0 && (
            <p className="self-start rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              {summary.uncoveredMonths.map(formatMonth).join(', ')} — no retention logged yet
            </p>
          )}
        </div>
      </div>

      {/* Receipts */}
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-medium text-gray-900">Receipts</h2>
          <span className="text-xs tabular-nums text-gray-400">
            what you invoiced · {summary.receiptCount} in {selectedYear}
          </span>
        </header>

        {receipts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            No receipts in {selectedYear}. Add your first one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                  <th className="w-5" />
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="w-[150px] px-3 py-2 text-left">Receipt date</th>
                  <th className="w-[120px] px-3 py-2 text-right">USD</th>
                  <th className="w-[140px] px-3 py-2 text-right">Soles</th>
                  <th className="w-[50px]" />
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => {
                  const month = monthOfReceipt(receipt)
                  const covered = retentionByMonth.has(month)
                  return (
                    <tr key={receipt.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="pl-2.5">
                        {/* The dot carries the whole coverage signal now: the
                            month it would name is the receipt date's month, so
                            a column for it only restated the date. */}
                        <span
                          title={
                            covered
                              ? `Covered by the ${formatMonth(month)} retention`
                              : 'Not covered by a retention yet'
                          }
                          className={`block h-1.5 w-1.5 rounded-full ${
                            covered ? 'bg-gray-300' : 'bg-amber-400'
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setReceiptDialog({ open: true, receipt })}
                          className="block max-w-full text-left hover:underline"
                        >
                          <span className="block truncate text-gray-900">
                            {receipt.description}
                          </span>
                          <span className="block truncate text-xs text-gray-400">
                            {[receipt.company, receipt.receipt_number].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {formatDate(receipt.receipt_date)}
                        {/* Only when the two dates disagree, which is about one
                            row in five — a column each was mostly repetition. */}
                        {receipt.income_date !== receipt.receipt_date && (
                          <span className="block text-xs text-gray-400">
                            income {formatDate(receipt.income_date)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                        {formatCents(receipt.amount_usd_cents)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                        {formatSoles(receiptSolesCents(receipt))}
                        <span className="block text-xs text-gray-300">
                          at {receipt.exchange_rate.toFixed(4)}
                        </span>
                      </td>
                      <td className="px-2 text-right">
                        <ConfirmButton
                          onConfirm={() => removeReceipt(receipt.id)}
                          title="Delete receipt?"
                          description={
                            <>
                              <span className="font-medium text-gray-900">
                                {receipt.description || 'This receipt'}
                              </span>{' '}
                              will be removed, and the year&rsquo;s tax recalculated.
                            </>
                          }
                          confirmLabel="Delete receipt"
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </ConfirmButton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50 text-sm font-medium text-gray-900">
                  <td />
                  <td className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-gray-500">
                    {summary.receiptCount} {summary.receiptCount === 1 ? 'receipt' : 'receipts'}
                  </td>
                  <td />
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatCents(summary.grossUsdCents)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatSoles(Math.round(summary.grossSolesExact * 100))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Retentions */}
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-medium text-gray-900">Retentions</h2>
          <span className="text-xs text-gray-400">
            what SUNAT charged · logged as given, not calculated
          </span>
        </header>

        {retentions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            Nothing logged for {selectedYear} yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                  <th className="w-[140px] px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-left">Covers</th>
                  <th className="w-[130px] px-3 py-2 text-right">Soles charged</th>
                  <th className="w-[110px] px-3 py-2 text-right">USD paid</th>
                  <th className="w-[150px] px-3 py-2 text-right">Implied</th>
                  <th className="w-[70px]" />
                </tr>
              </thead>
              <tbody>
                {summary.coverage
                  .filter((entry): entry is MonthCoverage & { retention: TaxRetention } =>
                    Boolean(entry.retention),
                  )
                  .map((entry) => (
                    <tr
                      key={entry.retention.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setRetentionDialog({ open: true, retention: entry.retention })
                          }
                          className="text-gray-900 hover:underline"
                        >
                          {formatMonth(entry.month)}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {entry.receipts.length === 0 ? (
                          <span className="text-gray-300">no receipts</span>
                        ) : (
                          entry.receipts.map((r) => r.receipt_number || '—').join(', ')
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                        {formatSoles(entry.retention.amount_soles_cents)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                        {entry.retention.amount_usd_cents === null
                          ? '—'
                          : formatCents(entry.retention.amount_usd_cents)}
                      </td>
                      {/* The rate and the income it's a share of, together — a
                          column each meant showing a ratio beside its own
                          denominator. */}
                      <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                        {entry.impliedRate === null
                          ? '—'
                          : `${(entry.impliedRate * 100).toFixed(2)}%`}
                        <span className="block text-xs text-gray-300">
                          of {formatSoles(Math.round(entry.incomeSolesExact * 100))}
                        </span>
                      </td>
                      <td className="px-2 text-right whitespace-nowrap">
                        {entry.retention.note && (
                          <Tooltip content={entry.retention.note}>
                            <button
                              type="button"
                              aria-label={`Note: ${entry.retention.note}`}
                              onClick={() =>
                                setRetentionDialog({ open: true, retention: entry.retention })
                              }
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            >
                              <StickyNote size={12} />
                            </button>
                          </Tooltip>
                        )}
                        <ConfirmButton
                          onConfirm={() => removeRetention(entry.retention.id)}
                          title="Delete retention?"
                          description={
                            <>
                              The{' '}
                              <span className="font-medium text-gray-900">
                                {formatMonth(entry.month)}
                              </span>{' '}
                              retention will be removed, and its receipts will read as uncovered.
                            </>
                          }
                          confirmLabel="Delete retention"
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50 text-sm font-medium text-gray-900">
                  <td className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-gray-500">
                    {retentions.length} {retentions.length === 1 ? 'month' : 'months'}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-gray-500">
                    {summary.receiptCount - countUncoveredReceipts(summary.coverage)} of{' '}
                    {summary.receiptCount} receipts
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatSoles(summary.retainedSolesCents)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatCents(summary.retainedUsdCents)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <ReceiptDialog
        open={receiptDialog.open}
        onOpenChange={(open) => setReceiptDialog((s) => ({ ...s, open }))}
        receipt={receiptDialog.receipt}
        suggestedCompany={lastReceipt?.company ?? ''}
        suggestedReceiptNumber={nextReceiptNumber(lastReceipt?.receipt_number ?? '')}
        suggestedUsdCents={lastReceipt?.amount_usd_cents ?? null}
        coveredMonths={coveredMonths}
        year={selectedYear}
      />
      <RetentionDialog
        open={retentionDialog.open}
        onOpenChange={(open) => setRetentionDialog((s) => ({ ...s, open }))}
        retention={retentionDialog.retention}
        coverage={summary.coverage}
        year={selectedYear}
      />
    </div>
  )
}

function countUncoveredReceipts(coverage: MonthCoverage[]): number {
  return coverage.reduce(
    (n, entry) => n + (entry.retention === null ? entry.receipts.length : 0),
    0,
  )
}

function Line({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? 'text-xs text-gray-400' : 'text-sm text-gray-500'}>{label}</span>
      <span
        className={
          muted
            ? 'text-xs tabular-nums text-gray-400'
            : 'text-sm font-medium tabular-nums text-gray-900'
        }
      >
        {value}
      </span>
    </div>
  )
}
