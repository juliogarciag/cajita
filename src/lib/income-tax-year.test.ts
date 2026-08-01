import { describe, expect, it } from 'vitest'
import {
  canSettleYear,
  compareReceiptNumbers,
  declarationMonth,
  formatMonth,
  nextReceiptNumber,
  normalizeRate,
  normalizeReceipt,
  receiptSolesCents,
  receiptSolesExact,
  taxYearSummary,
  type ReceiptLike,
  type RetentionLike,
} from './income-tax-year.js'

/**
 * The real 2025 year, transcribed from the spreadsheet. Twelve receipts across
 * nine declaration months — January, March and June each hold two, which is
 * what makes one retention cover two receipts.
 */
const RECEIPTS_2025: ReceiptLike[] = [
  ['E001-123', 'Sueldo de Diciembre 2024', '2025-01-31', 1198500, 3.712],
  ['E001-124', 'Sueldo de Enero 2025', '2025-01-31', 1198500, 3.712],
  ['E001-125', 'Sueldo de Febrero 2025', '2025-03-01', 1198500, 3.671],
  ['E001-126', 'Sueldo de Marzo 2025', '2025-03-31', 1198500, 3.647],
  ['E001-127', 'Sueldo de Abril 2025', '2025-05-04', 1217700, 3.651],
  ['E001-128', 'Sueldo de Mayo 2025', '2025-06-05', 1198500, 3.61],
  ['E001-129', 'Sueldo de Junio 2025', '2025-06-30', 1198500, 3.539],
  ['E001-130', 'Sueldo de Julio 2025', '2025-07-31', 1198500, 3.556],
  ['E001-131', 'Sueldo de Agosto 2025', '2025-09-01', 1198500, 3.53],
  ['E001-132', 'Sueldo de Septiembre 2025', '2025-10-02', 1198500, 3.465],
  ['E001-133', 'Sueldo de Octubre 2025', '2025-11-03', 1198500, 3.372],
  ['E001-134', 'Sueldo de Noviembre 2025', '2025-12-01', 1198500, 3.357],
].map(([receipt_number, description, receipt_date, amount_usd_cents, exchange_rate]) => ({
  id: receipt_number as string,
  receipt_number: receipt_number as string,
  description: description as string,
  receipt_date: receipt_date as string,
  amount_usd_cents: amount_usd_cents as number,
  exchange_rate: exchange_rate as number,
}))

const RETENTIONS_2025: RetentionLike[] = [
  ['2025-01', 757300, 429299],
  ['2025-03', 734300, null],
  ['2025-05', 365400, 405727],
  ['2025-06', 698600, null],
  ['2025-07', 345700, null],
  ['2025-09', 337700, 98397],
  ['2025-10', 333600, 99170],
  ['2025-11', 322700, 96185],
  ['2025-12', 322400, 96470],
].map(([month, amount_soles_cents, amount_usd_cents]) => ({
  id: month as string,
  month: month as string,
  amount_soles_cents: amount_soles_cents as number,
  amount_usd_cents: amount_usd_cents as number | null,
  note: '',
}))

describe('normalizeReceipt', () => {
  // Electric delivers Postgres `numeric` as a string and the collection schema
  // only validates writes, so an un-normalised row reaches the maths with
  // `exchange_rate: "3.965000"`. It multiplies by accident and then breaks on
  // the first number method called on it.
  const raw = {
    id: 'a',
    receipt_number: 'E001-90',
    description: 'Sueldo de Junio',
    receipt_date: '2022-10-07',
    amount_usd_cents: 458333,
    exchange_rate: '3.965000',
    company: 'Trudan SpA.',
  }

  it('turns a numeric string into a number', () => {
    const receipt = normalizeReceipt(raw)
    expect(receipt.exchange_rate).toBe(3.965)
    expect(typeof receipt.exchange_rate).toBe('number')
  })

  it('leaves the other fields alone', () => {
    expect(normalizeReceipt(raw).company).toBe('Trudan SpA.')
  })

  it('is a no-op on a row that already has a number', () => {
    expect(normalizeReceipt({ ...raw, exchange_rate: 3.965 }).exchange_rate).toBe(3.965)
  })

  it('makes number methods safe, which is the whole point', () => {
    expect(normalizeReceipt(raw).exchange_rate.toFixed(4)).toBe('3.9650')
  })
})

describe('normalizeRate', () => {
  it('parses the string Postgres sends', () => {
    expect(normalizeRate('3.480000')).toBe(3.48)
  })

  it('passes a number through', () => {
    expect(normalizeRate(3.48)).toBe(3.48)
  })

  it('treats absent and unparseable alike', () => {
    expect(normalizeRate(null)).toBeNull()
    expect(normalizeRate(undefined)).toBeNull()
    expect(normalizeRate('not a rate')).toBeNull()
  })
})

describe('receipt soles', () => {
  const receipt = RECEIPTS_2025[2] // 11,985.00 at 3.671

  it('derives soles at full precision, unrounded', () => {
    expect(receiptSolesExact(receipt)).toBeCloseTo(43996.935, 6)
  })

  it('rounds to cents only for display', () => {
    expect(receiptSolesCents(receipt)).toBe(4399694)
  })

  it('rounds a float edge case the way the spreadsheet displays it', () => {
    // 1198500 * 3.401 is 4076098.4999999995 in binary floating point, so
    // rounding the product gives ...98 where the sheet shows S/ 40,760.99.
    const edge = { ...receipt, amount_usd_cents: 1198500, exchange_rate: 3.401 }
    expect(receiptSolesCents(edge)).toBe(4076099)
  })

  it('takes the declaration month from the receipt date', () => {
    expect(declarationMonth(receipt)).toBe('2025-03')
  })
})

describe('taxYearSummary — reproduces the 2025 sheet header', () => {
  const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
    regularizationRate: 3.48,
  })

  it('sums gross income to the sheet total', () => {
    // "Entradas": S/ 513,922.662 and $144,012.00
    expect(summary.grossSolesExact).toBeCloseTo(513922.662, 6)
    expect(summary.grossUsdCents).toBe(14401200)
  })

  it('sums retentions to the sheet totals', () => {
    // "Retención (PEN)" S/ 42,177.00 and "Retención (USD)" $12,252.48
    expect(summary.retainedSolesCents).toBe(4217700)
    expect(summary.retainedUsdCents).toBe(1225248)
  })

  it('computes the tax the sheet reported', () => {
    expect(summary.tax?.totalTaxSoles).toBe(77599)
  })

  it('computes the regularization the sheet reported', () => {
    // "Regularización": S/ 35,422.00, and $10,178.74 at 3.48
    expect(summary.regularizationSolesCents).toBe(3542200)
    expect(summary.regularizationUsdCents).toBe(1017874)
  })

  it('computes the true dollar cost the sheet reported', () => {
    // "Impuesto Total" in dollars: $22,431.22
    expect(summary.trueCostUsdCents).toBe(2243122)
    // The sheet divides its unrounded $22,431.21563 and gets 0.1557593508. We
    // divide the rounded cents instead, so the percentage on screen agrees with
    // the dollar figure next to it — a 3e-8 difference, invisible at 15.58%.
    expect(summary.effectiveUsdRate).toBeCloseTo(0.1557593508, 7)
  })
})

describe('taxYearSummary — coverage', () => {
  const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025)

  it('groups receipts by declaration month', () => {
    expect(summary.coverage.map((c) => [c.month, c.receipts.length])).toEqual([
      ['2025-01', 2],
      ['2025-03', 2],
      ['2025-05', 1],
      ['2025-06', 2],
      ['2025-07', 1],
      ['2025-09', 1],
      ['2025-10', 1],
      ['2025-11', 1],
      ['2025-12', 1],
    ])
  })

  it('lands one retention on each month, covering every receipt', () => {
    expect(summary.coverage.every((c) => c.retention !== null)).toBe(true)
    expect(summary.uncoveredMonths).toEqual([])
    const covered = summary.coverage.reduce((n, c) => n + c.receipts.length, 0)
    expect(covered).toBe(12)
  })

  it('reports the implied rate without judging it', () => {
    // January and March carry fees for prior years, so they sit above 8%.
    const rates = summary.coverage.map((c) => Number(((c.impliedRate ?? 0) * 100).toFixed(2)))
    expect(rates).toEqual([8.51, 8.37, 8.22, 8.15, 8.11, 7.98, 8.03, 7.98, 8.01])
  })

  it('names a month with two receipts as covering both', () => {
    const june = summary.coverage.find((c) => c.month === '2025-06')
    expect(june?.receipts.map((r) => r.receipt_number)).toEqual(['E001-128', 'E001-129'])
    expect(june?.incomeSolesExact).toBeCloseTo(85680.765, 4)
  })

  it('flags a month whose receipts have no retention yet', () => {
    const partial = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025.slice(0, 8), 2025)
    expect(partial.uncoveredMonths).toEqual(['2025-12'])
  })

  it('keeps a retention that covers no receipts, so the total still adds up', () => {
    const stray: RetentionLike = {
      id: 'stray',
      month: '2025-02',
      amount_soles_cents: 50000,
      amount_usd_cents: null,
      note: 'penalty for 2022',
    }
    const summary = taxYearSummary(RECEIPTS_2025, [...RETENTIONS_2025, stray], 2025)
    const february = summary.coverage.find((c) => c.month === '2025-02')
    expect(february?.receipts).toEqual([])
    expect(february?.impliedRate).toBeNull()
    expect(summary.retainedSolesCents).toBe(4217700 + 50000)
  })
})

describe('taxYearSummary — edges', () => {
  it('reports no tax when the UIT is unpublished, rather than guessing', () => {
    const summary = taxYearSummary(RECEIPTS_2025, [], 2027)
    expect(summary.uit).toBeNull()
    expect(summary.tax).toBeNull()
    expect(summary.regularizationSolesCents).toBeNull()
    expect(summary.trueCostUsdCents).toBeNull()
    // Income still adds up — only the tax is withheld.
    expect(summary.grossUsdCents).toBe(14401200)
  })

  it('uses a UIT override for a year SUNAT has not published', () => {
    const summary = taxYearSummary(RECEIPTS_2025, [], 2027, { uitOverride: 5600 })
    expect(summary.uit).toBe(5600)
    expect(summary.tax?.totalTaxSoles).toBeGreaterThan(0)
  })

  it('borrows the last receipt’s rate when the year has none of its own', () => {
    // E001-134, the December receipt, at 3.357 — a real SUNAT rate, so the
    // dollar column isn't blank until someone remembers to fill it in.
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025)
    expect(summary.regularizationRate).toBe(3.357)
    expect(summary.rateInheritedFrom).toBe('E001-134')
    expect(summary.regularizationUsdCents).toBe(Math.round(3542200 / 3.357))
  })

  it('prefers the year’s own rate and stops calling it borrowed', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      regularizationRate: 3.48,
    })
    expect(summary.regularizationRate).toBe(3.48)
    expect(summary.rateInheritedFrom).toBeNull()
    expect(summary.regularizationUsdCents).toBe(1017874)
  })

  it('has nothing to borrow when the year has no receipts', () => {
    const summary = taxYearSummary([], RETENTIONS_2025, 2025)
    expect(summary.regularizationRate).toBeNull()
    expect(summary.rateInheritedFrom).toBeNull()
    expect(summary.regularizationUsdCents).toBeNull()
  })

  it('ignores a nonsense rate rather than dividing by zero', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, { regularizationRate: 0 })
    expect(summary.regularizationUsdCents).toBeNull()
  })

  it('reports a negative regularization when more was retained than owed', () => {
    const over: RetentionLike[] = [
      {
        id: 'a',
        month: '2025-01',
        amount_soles_cents: 9_000_000,
        amount_usd_cents: null,
        note: '',
      },
    ]
    const summary = taxYearSummary(RECEIPTS_2025, over, 2025)
    expect(summary.regularizationSolesCents).toBe(77599 * 100 - 9_000_000)
    expect(summary.regularizationSolesCents).toBeLessThan(0)
  })

  it('handles an empty year', () => {
    const summary = taxYearSummary([], [], 2026)
    expect(summary.receiptCount).toBe(0)
    expect(summary.grossSolesExact).toBe(0)
    expect(summary.tax?.totalTaxSoles).toBe(0)
    expect(summary.coverage).toEqual([])
    expect(summary.uncoveredMonths).toEqual([])
    expect(summary.effectiveUsdRate).toBeNull()
  })
})

describe('taxYearSummary — true cost', () => {
  it('converts the computed regularization while the year is unpaid', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      regularizationRate: 3.48,
    })
    // $10,178.74 regularization + $12,252.48 retained
    expect(summary.regularizationUsdCents).toBe(1017874)
    expect(summary.trueCostUsdCents).toBe(2243122)
  })

  it('prefers the dollars actually paid once the year is settled', () => {
    // Paid at a worse rate than the estimate assumed, so it really cost more.
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      regularizationRate: 3.48,
      paidOn: '2026-03-25',
      paidSolesCents: 3542200,
      paidUsdCents: 1100000, // $11,000.00
    })
    expect(summary.trueCostUsdCents).toBe(1100000 + 1225248)
    // The computed conversion is still reported; it just no longer drives cost.
    expect(summary.regularizationUsdCents).toBe(1017874)
  })

  it('carries the paid figure through to the effective rate', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      regularizationRate: 3.48,
      paidOn: '2026-03-25',
      paidUsdCents: 1100000,
    })
    expect(summary.effectiveUsdRate).toBeCloseTo((1100000 + 1225248) / 14401200, 10)
  })

  it('falls back to the conversion when the payment recorded no dollars', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      regularizationRate: 3.48,
      paidOn: '2026-03-25',
      paidSolesCents: 3542200,
    })
    expect(summary.trueCostUsdCents).toBe(2243122)
  })

  it('ignores a stray paid amount when nothing marks the year settled', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      regularizationRate: 3.48,
      paidUsdCents: 1100000,
    })
    expect(summary.trueCostUsdCents).toBe(2243122)
  })
})

describe('taxYearSummary — settlement', () => {
  it('says a year owes when nothing has been paid', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      regularizationRate: 3.48,
    })
    expect(summary.settlement).toEqual({
      kind: 'owes',
      solesCents: 3542200,
      usdCents: 1017874,
    })
  })

  it('says settled once a payment is recorded', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      paidOn: '2026-03-25',
      paidSolesCents: 3542200,
      paidUsdCents: 1017874,
    })
    expect(summary.settlement).toMatchObject({
      kind: 'settled',
      paidOn: '2026-03-25',
      paidSolesCents: 3542200,
      differsFromComputed: false,
    })
  })

  it('flags a payment that differs from the computed figure, without judging it', () => {
    // What the portal charges at filing time can carry late interest.
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      paidOn: '2026-03-25',
      paidSolesCents: 3600000,
    })
    expect(summary.settlement).toMatchObject({
      kind: 'settled',
      differsFromComputed: true,
      computedSolesCents: 3542200,
    })
  })

  it('does not call it a discrepancy when only the date was recorded', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2025, {
      paidOn: '2026-03-25',
    })
    expect(summary.settlement).toMatchObject({ kind: 'settled', differsFromComputed: false })
  })

  it('reports a refund rather than a negative amount to pay', () => {
    // This is the case the old headline rendered as "Still to pay −S/ 4,578".
    const over: RetentionLike[] = [
      {
        id: 'a',
        month: '2025-01',
        amount_soles_cents: 9_000_000,
        amount_usd_cents: null,
        note: '',
      },
    ]
    const summary = taxYearSummary(RECEIPTS_2025, over, 2025, { regularizationRate: 3.48 })
    expect(summary.regularizationSolesCents).toBeLessThan(0)
    expect(summary.settlement.kind).toBe('refund')
    if (summary.settlement.kind === 'refund') {
      expect(summary.settlement.solesCents).toBe(9_000_000 - 77599 * 100)
      expect(summary.settlement.solesCents).toBeGreaterThan(0)
      expect(summary.settlement.usdCents).toBeGreaterThan(0)
    }
  })

  it('a recorded payment wins over the computed sign', () => {
    const over: RetentionLike[] = [
      {
        id: 'a',
        month: '2025-01',
        amount_soles_cents: 9_000_000,
        amount_usd_cents: null,
        note: '',
      },
    ]
    const summary = taxYearSummary(RECEIPTS_2025, over, 2025, { paidOn: '2026-03-25' })
    expect(summary.settlement.kind).toBe('settled')
  })

  it('says square when the retentions matched the tax exactly', () => {
    const exact: RetentionLike[] = [
      {
        id: 'a',
        month: '2025-01',
        amount_soles_cents: 77599 * 100,
        amount_usd_cents: null,
        note: '',
      },
    ]
    const summary = taxYearSummary(RECEIPTS_2025, exact, 2025)
    expect(summary.regularizationSolesCents).toBe(0)
    expect(summary.settlement).toEqual({ kind: 'square' })
  })

  it('asserts nothing when the UIT is unpublished', () => {
    const summary = taxYearSummary(RECEIPTS_2025, RETENTIONS_2025, 2027)
    expect(summary.settlement).toEqual({ kind: 'unknown' })
  })

  it('asserts nothing on an empty year', () => {
    // No income, no tax, nothing retained — square, not owing.
    expect(taxYearSummary([], [], 2026).settlement).toEqual({ kind: 'square' })
  })
})

describe('canSettleYear', () => {
  it('allows a year that has ended', () => {
    expect(canSettleYear(2025, 2026)).toBe(true)
    expect(canSettleYear(2022, 2026)).toBe(true)
  })

  it('refuses the current year — its filing happens next March', () => {
    expect(canSettleYear(2026, 2026)).toBe(false)
  })

  it('refuses a year that hasn’t happened', () => {
    expect(canSettleYear(2027, 2026)).toBe(false)
  })
})

describe('compareReceiptNumbers', () => {
  it('orders by the trailing number, not as text', () => {
    // A plain string compare puts "E001-99" above "E001-141", because '9' beats
    // '1' — which picks a receipt from four years ago as the most recent.
    expect(compareReceiptNumbers('E001-141', 'E001-99')).toBeGreaterThan(0)
    expect(compareReceiptNumbers('E001-99', 'E001-141')).toBeLessThan(0)
    expect(compareReceiptNumbers('E001-100', 'E001-100')).toBe(0)
  })

  it('sorts a full run the way the receipts actually run', () => {
    const sorted = ['E001-99', 'E001-141', 'E001-78', 'E001-100', 'E001-9'].sort(
      compareReceiptNumbers,
    )
    expect(sorted).toEqual(['E001-9', 'E001-78', 'E001-99', 'E001-100', 'E001-141'])
  })

  it('picks the highest of the real 2022–2026 range', () => {
    const all = ['E001-78', 'E001-89', 'E001-99', 'E001-110', 'E001-134', 'E001-141']
    const highest = all.reduce((best, n) => (compareReceiptNumbers(n, best) > 0 ? n : best))
    expect(highest).toBe('E001-141')
  })

  it('falls back to a text compare when there is no number', () => {
    expect(compareReceiptNumbers('abc', 'abd')).toBeLessThan(0)
  })
})

describe('nextReceiptNumber', () => {
  it('increments the trailing number', () => {
    expect(nextReceiptNumber('E001-141')).toBe('E001-142')
  })

  it('carries past a round hundred', () => {
    expect(nextReceiptNumber('E001-99')).toBe('E001-100')
  })

  it('keeps zero padding', () => {
    expect(nextReceiptNumber('E001-007')).toBe('E001-008')
  })

  it('gives up rather than guessing when there is no number', () => {
    expect(nextReceiptNumber('')).toBe('')
    expect(nextReceiptNumber('no digits here')).toBe('')
  })
})

describe('formatMonth', () => {
  it('names the month', () => {
    expect(formatMonth('2025-06')).toBe('June 2025')
    expect(formatMonth('2026-01')).toBe('January 2026')
  })

  it('passes through something it cannot parse', () => {
    expect(formatMonth('nonsense')).toBe('nonsense')
  })
})
