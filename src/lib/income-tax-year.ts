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

/**
 * What the year's headline is allowed to assert.
 *
 * The summary leads with one confident number, so it has to know which number.
 * "Still to pay" is wrong for a year settled two Marches ago, and it's nonsense
 * for a year where the retentions overshot the tax — that comes back as a
 * negative regularization, and there's a test pinning it.
 */
export type Settlement =
  /** No UIT published and no override, so there's no honest figure at all. */
  | { kind: 'unknown' }
  /** Owes, not settled. */
  | { kind: 'owes'; solesCents: number; usdCents: number | null }
  /** Retained exactly what was owed. */
  | { kind: 'square' }
  /** Retained more than owed — SUNAT owes a refund. Magnitude is positive. */
  | { kind: 'refund'; solesCents: number; usdCents: number | null }
  /** Settled. The paid figures are what was actually handed over. */
  | {
      kind: 'settled'
      paidOn: string
      paidSolesCents: number | null
      paidUsdCents: number | null
      /** The computed figure, kept so a discrepancy can be shown, not hidden. */
      computedSolesCents: number
      /** True when what was paid differs from what was computed. */
      differsFromComputed: boolean
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
  /** The rate used to put the regularization in dollars — the year's own, or inherited. */
  regularizationRate: number | null
  /**
   * The receipt this year's rate was borrowed from, or null when the rate is the
   * year's own. A borrowed rate is a reasonable default, not a confirmed fact
   * about the filing, so the UI has to be able to say which it is.
   */
  rateInheritedFrom: string | null
  /** What the headline is allowed to claim. */
  settlement: Settlement
  regularizationUsdCents: number | null
  /** Regularization plus what was already retained in dollars. */
  trueCostUsdCents: number | null
  /** True cost over gross dollars. Null when either is unavailable. */
  effectiveUsdRate: number | null
  /** Every month with a receipt or a retention, oldest first. */
  coverage: MonthCoverage[]
}

export interface TaxYearOptions {
  /**
   * The year's own hand-entered rate. When absent, the last receipt of the year
   * lends its rate — a real SUNAT rate looked up recently, rather than a stale
   * settlement rate from some previous March. Kept per year deliberately: the
   * rate a closed year settled at is a fact about that filing, and one shared
   * value would rewrite every closed year's dollar figures on the next edit.
   */
  regularizationRate?: number | null
  /** Stands in for a UIT SUNAT hasn't published yet. */
  uitOverride?: number | null
  /** Set once the regularization is settled. */
  paidOn?: string | null
  paidSolesCents?: number | null
  paidUsdCents?: number | null
}

export function taxYearSummary(
  receipts: ReceiptLike[],
  retentions: RetentionLike[],
  year: number,
  options: TaxYearOptions = {},
): TaxYearSummary {
  const uit = options.uitOverride ?? uitForYear(year)

  // A year with no rate of its own borrows one from its last receipt, so the
  // dollar column isn't blank every January. Marked as borrowed, never passed
  // off as the year's own.
  const ownRate = options.regularizationRate ?? null
  const lastReceipt = [...receipts].sort(
    (a, b) =>
      a.receipt_date.localeCompare(b.receipt_date) ||
      compareReceiptNumbers(a.receipt_number, b.receipt_number),
  )[receipts.length - 1]
  const inherited =
    ownRate === null && lastReceipt && lastReceipt.exchange_rate > 0 ? lastReceipt : null
  const regularizationRate = ownRate ?? inherited?.exchange_rate ?? null
  const rateInheritedFrom = inherited ? inherited.receipt_number || inherited.id : null

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

  // What the regularization actually cost in dollars, preferring the figure
  // recorded when it was paid over a conversion of the computed one. Once the
  // money has moved, the amount that left the account is the fact; the
  // conversion was only ever an estimate standing in for it.
  const paidUsdCents = options.paidOn != null ? (options.paidUsdCents ?? null) : null
  const regularizationCostUsdCents = paidUsdCents ?? regularizationUsdCents

  const trueCostUsdCents =
    regularizationCostUsdCents === null ? null : regularizationCostUsdCents + retainedUsdCents

  const effectiveUsdRate =
    trueCostUsdCents === null || grossUsdCents === 0 ? null : trueCostUsdCents / grossUsdCents

  // --- What the headline may claim. A recorded payment wins over the computed
  // sign: if it's been settled, that's the fact, whatever the arithmetic says.
  const paidOn = options.paidOn ?? null
  const settlement: Settlement =
    regularizationSolesCents === null
      ? { kind: 'unknown' }
      : paidOn !== null
        ? {
            kind: 'settled',
            paidOn,
            paidSolesCents: options.paidSolesCents ?? null,
            paidUsdCents: options.paidUsdCents ?? null,
            computedSolesCents: regularizationSolesCents,
            differsFromComputed:
              options.paidSolesCents != null && options.paidSolesCents !== regularizationSolesCents,
          }
        : regularizationSolesCents > 0
          ? {
              kind: 'owes',
              solesCents: regularizationSolesCents,
              usdCents: regularizationUsdCents,
            }
          : regularizationSolesCents < 0
            ? {
                kind: 'refund',
                solesCents: -regularizationSolesCents,
                usdCents: regularizationUsdCents === null ? null : -regularizationUsdCents,
              }
            : { kind: 'square' }

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
    rateInheritedFrom,
    settlement,
    regularizationUsdCents,
    trueCostUsdCents,
    effectiveUsdRate,
    coverage,
  }
}

/**
 * Whether a year's regularization can have been paid yet.
 *
 * SUNAT settles a year with an annual filing the *following* year, so the
 * current year's figure is a running estimate — more receipts are still coming.
 * Marking it paid would be claiming something that can't have happened.
 */
export function canSettleYear(year: number, currentYear: number): boolean {
  return year < currentYear
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
