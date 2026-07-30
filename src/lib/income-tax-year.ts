import { incomeTax, uitForYear, type IncomeTaxBreakdown } from './income-tax.js'

/**
 * Turns a year's receipts and retentions into everything the page shows.
 *
 * The two are separate kinds of fact and are kept separate all the way through:
 * a receipt is what was invoiced, a retention is what SUNAT's portal charged
 * that month. Nothing here derives one from the other — the only thing computed
 * across them is coverage, and that comes from the receipt dates.
 */

/** Only the fields the maths needs, so this works on collection rows directly. */
export interface ReceiptLike {
  id: string
  receipt_number: string
  description: string
  /** YYYY-MM-DD. The month of this date is the SUNAT declaration month. */
  receipt_date: string
  amount_usd_cents: number
  exchange_rate: number
}

/** A row as Electric actually delivers it — see `normalizeReceipt`. */
export type RawReceipt = Omit<ReceiptLike, 'exchange_rate'> & {
  exchange_rate: string | number
}

/**
 * Turns a synced row into one the maths can trust.
 *
 * Postgres `integer` columns arrive over Electric as numbers, but `numeric`
 * arrives as a string — "3.965000" — and the collection's Zod schema does not
 * transform synced rows, only validates writes. So `exchange_rate` is a string
 * at runtime however it's typed, which multiplies by accident and breaks the
 * moment anything calls a number method on it.
 *
 * Every raw row is normalised here, once, on the way in. Nothing downstream
 * should have to know.
 */
export function normalizeReceipt<T extends RawReceipt>(
  row: T,
): Omit<T, 'exchange_rate'> & { exchange_rate: number } {
  return { ...row, exchange_rate: Number(row.exchange_rate) }
}

/** Same problem, same fix, for the hand-entered per-year rate. */
export function normalizeRate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export interface RetentionLike {
  id: string
  /** YYYY-MM — the declaration month, one row per month. */
  month: string
  amount_soles_cents: number
  amount_usd_cents: number | null
  note: string
}

/**
 * A receipt's soles amount, at full precision, in soles units.
 *
 * Deliberately not stored and not rounded. The spreadsheet's soles column is an
 * unrounded `USD × rate`, and its yearly total is the sum of those; rounding
 * each row to cents first drifts a few cents off the gross that gets compared
 * against SUNAT. Round only when displaying.
 */
export function receiptSolesExact(receipt: ReceiptLike): number {
  return (receipt.amount_usd_cents / 100) * receipt.exchange_rate
}

/**
 * The same amount rounded to cents, for display.
 *
 * Rounds the exact soles figure rather than `cents x rate`, so what's shown is
 * always the value the tax uses, just rounded. The two disagree in practice:
 * 1198500 x 3.401 lands on 4076098.4999999995 in binary floating point and
 * rounds down, where the spreadsheet shows S/ 40,760.99.
 */
export function receiptSolesCents(receipt: ReceiptLike): number {
  return Math.round(receiptSolesExact(receipt) * 100)
}

/** The declaration month a receipt falls into: "2025-06". */
export function declarationMonth(receipt: ReceiptLike): string {
  return receipt.receipt_date.slice(0, 7)
}

export interface MonthCoverage {
  /** YYYY-MM */
  month: string
  /** Receipts issued in this month, oldest first. */
  receipts: ReceiptLike[]
  /** Gross income these receipts represent, in soles units. */
  incomeSolesExact: number
  /** What SUNAT charged for the month, or null when nothing is logged yet. */
  retention: RetentionLike | null
  /**
   * Retention over the income it covers. Informational only — the figure is
   * whatever the portal said, so this is never a pass/fail. Null when there is
   * no retention or no income to divide by.
   */
  impliedRate: number | null
}

export interface TaxYearSummary {
  year: number
  /** Null when SUNAT hasn't published the UIT and no override is set. */
  uit: number | null
  receiptCount: number
  /** Gross in soles units, at full precision. */
  grossSolesExact: number
  grossUsdCents: number
  retainedSolesCents: number
  /** Only the retentions that recorded a dollar figure. */
  retainedUsdCents: number
  /** Null when the UIT is unknown — there is no honest number to show. */
  tax: IncomeTaxBreakdown | null
  /** Tax minus what was retained. Negative means SUNAT owes a refund. */
  regularizationSolesCents: number | null
  /** The rate used to put the regularization in dollars, if one is set. */
  regularizationRate: number | null
  regularizationUsdCents: number | null
  /** Regularization plus what was already retained in dollars. */
  trueCostUsdCents: number | null
  /** True cost over gross dollars. Null when either is unavailable. */
  effectiveUsdRate: number | null
  /** Every month with a receipt or a retention, oldest first. */
  coverage: MonthCoverage[]
  /** Months holding receipts with nothing logged against them yet. */
  uncoveredMonths: string[]
}

export interface TaxYearOptions {
  /** Hand-entered rate for converting the regularization to dollars. */
  regularizationRate?: number | null
  /** Stands in for a UIT SUNAT hasn't published yet. */
  uitOverride?: number | null
}

export function taxYearSummary(
  receipts: ReceiptLike[],
  retentions: RetentionLike[],
  year: number,
  options: TaxYearOptions = {},
): TaxYearSummary {
  const regularizationRate = options.regularizationRate ?? null
  const uit = options.uitOverride ?? uitForYear(year)

  const grossSolesExact = receipts.reduce((total, r) => total + receiptSolesExact(r), 0)
  const grossUsdCents = receipts.reduce((total, r) => total + r.amount_usd_cents, 0)
  const retainedSolesCents = retentions.reduce((total, r) => total + r.amount_soles_cents, 0)
  const retainedUsdCents = retentions.reduce((total, r) => total + (r.amount_usd_cents ?? 0), 0)

  const tax = uit === null ? null : incomeTax(grossSolesExact, year, uit)

  // The tax is whole soles; retentions are cents. Both go to cents to subtract.
  const regularizationSolesCents =
    tax === null ? null : tax.totalTaxSoles * 100 - retainedSolesCents

  const regularizationUsdCents =
    regularizationSolesCents === null || regularizationRate === null || regularizationRate <= 0
      ? null
      : Math.round(regularizationSolesCents / regularizationRate)

  const trueCostUsdCents =
    regularizationUsdCents === null ? null : regularizationUsdCents + retainedUsdCents

  const effectiveUsdRate =
    trueCostUsdCents === null || grossUsdCents === 0 ? null : trueCostUsdCents / grossUsdCents

  // --- Coverage, keyed by month. A retention with no receipts still appears:
  // its amount counts toward the year either way, and hiding it would make the
  // retained total disagree with the rows on screen.
  const byMonth = new Map<string, MonthCoverage>()
  const monthOf = (month: string): MonthCoverage => {
    let entry = byMonth.get(month)
    if (!entry) {
      entry = { month, receipts: [], incomeSolesExact: 0, retention: null, impliedRate: null }
      byMonth.set(month, entry)
    }
    return entry
  }

  for (const receipt of receipts) {
    const entry = monthOf(declarationMonth(receipt))
    entry.receipts.push(receipt)
    entry.incomeSolesExact += receiptSolesExact(receipt)
  }
  for (const retention of retentions) {
    monthOf(retention.month).retention = retention
  }

  const coverage = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
  for (const entry of coverage) {
    entry.receipts.sort(
      (a, b) =>
        a.receipt_date.localeCompare(b.receipt_date) ||
        a.receipt_number.localeCompare(b.receipt_number),
    )
    entry.impliedRate =
      entry.retention && entry.incomeSolesExact > 0
        ? entry.retention.amount_soles_cents / 100 / entry.incomeSolesExact
        : null
  }

  return {
    year,
    uit,
    receiptCount: receipts.length,
    grossSolesExact,
    grossUsdCents,
    retainedSolesCents,
    retainedUsdCents,
    tax,
    regularizationSolesCents,
    regularizationRate,
    regularizationUsdCents,
    trueCostUsdCents,
    effectiveUsdRate,
    coverage,
    uncoveredMonths: coverage
      .filter((entry) => entry.receipts.length > 0 && entry.retention === null)
      .map((entry) => entry.month),
  }
}

/**
 * Orders receipt numbers by their trailing digits, not as text.
 *
 * "E001-99" sorts above "E001-141" under a plain string compare, because '9'
 * beats '1' on the first differing character. The numbers run past 100, so that
 * picks a receipt from four years ago as the most recent one.
 */
export function compareReceiptNumbers(a: string, b: string): number {
  const split = (value: string) => {
    const match = value.match(/^(.*?)(\d+)(\D*)$/)
    return match ? { prefix: match[1], digits: Number(match[2]), suffix: match[3] } : null
  }
  const left = split(a)
  const right = split(b)
  if (!left || !right) return a.localeCompare(b)
  return (
    left.prefix.localeCompare(right.prefix) ||
    left.digits - right.digits ||
    left.suffix.localeCompare(right.suffix)
  )
}

/** Suggests the number after this one: "E001-141" → "E001-142". */
export function nextReceiptNumber(previous: string): string {
  const match = previous.match(/^(.*?)(\d+)(\D*)$/)
  if (!match) return ''
  const [, prefix, digits, suffix] = match
  return `${prefix}${String(Number(digits) + 1).padStart(digits.length, '0')}${suffix}`
}

/** "2025-06" → "June 2025", for headings and the month picker. */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-')
  const index = Number(m) - 1
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return names[index] ? `${names[index]} ${year}` : month
}
