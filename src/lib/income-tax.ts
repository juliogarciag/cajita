/**
 * Peruvian fourth-category income tax (renta de cuarta categoría).
 *
 * A port of the Google Sheets custom function this replaces. The sheet is the
 * reference implementation, so the arithmetic is kept exactly as it was —
 * including where it rounds — and income-tax.test.ts pins every year against
 * the figures the sheet produced. Changing a rounding point here silently
 * changes what the March filing says, so don't tidy it without a failing test.
 *
 * Two deductions apply before the brackets: 20% of gross capped at 24 UIT,
 * then a flat 7 UIT. Both are SUNAT's, not ours.
 */

/**
 * UIT (Unidad Impositiva Tributaria) in soles. SUNAT sets it once a year and
 * every threshold below is a multiple of it, so one wrong entry moves the whole
 * year's answer. Values are only added here once published — see `uitForYear`,
 * which refuses to guess rather than quietly extrapolating.
 */
export const UIT_BY_YEAR: Record<number, number> = {
  2010: 3600,
  2011: 3600,
  2012: 3650,
  2013: 3700,
  2014: 3800,
  2015: 3850,
  2016: 3950,
  2017: 4050,
  2018: 4150,
  2019: 4200,
  2020: 4300,
  2021: 4400,
  2022: 4600,
  2023: 4950,
  2024: 5150,
  2025: 5350,
  2026: 5500,
}

/**
 * The bracket ladder, in UIT-widths rather than soles so it survives the UIT
 * changing every year. Rates are whole percents on purpose: stored as 0.14 they
 * print as 14.000000000000002, and these get displayed.
 */
export const TAX_BRACKETS: ReadonlyArray<{ widthInUit: number; ratePercent: number }> = [
  { widthInUit: 5, ratePercent: 8 },
  { widthInUit: 15, ratePercent: 14 },
  { widthInUit: 15, ratePercent: 17 },
  { widthInUit: 10, ratePercent: 20 },
  { widthInUit: Infinity, ratePercent: 30 },
]

/** The 20% deduction stops here — reached only above ~S/ 660k of gross. */
const FIRST_DEDUCTION_CAP_IN_UIT = 24
const FIRST_DEDUCTION_RATE = 0.2
const SECOND_DEDUCTION_IN_UIT = 7

export interface BracketResult {
  ratePercent: number
  /** Where this bracket sits on the ladder, in UIT. `null` max means no ceiling. */
  fromUit: number
  toUit: number | null
  /** Bracket width in soles, or `null` for the top bracket. */
  widthSoles: number | null
  /** How much of the taxable base landed in this bracket. */
  taxableSoles: number
  /** Tax from this bracket alone, in whole soles. */
  taxSoles: number
}

export interface IncomeTaxBreakdown {
  year: number
  uit: number
  grossSoles: number
  /** 20% of gross, capped, rounded to whole soles — the sheet rounds here. */
  firstDeductionSoles: number
  /** A flat 7 UIT, or whatever is left if less. Not rounded; it's already whole. */
  secondDeductionSoles: number
  /** What the brackets are applied to. */
  taxableBaseSoles: number
  brackets: BracketResult[]
  /** The number that matters, in whole soles. */
  totalTaxSoles: number
  /** Tax over gross. Zero when there's no income, rather than NaN. */
  effectiveRate: number
}

/**
 * The UIT for a year, or null when it hasn't been published yet.
 *
 * Next year's figure lands late in December, so a January projection has no
 * real value to use. Returning null makes callers say so instead of showing a
 * number built on a guess.
 */
export function uitForYear(year: number): number | null {
  return UIT_BY_YEAR[year] ?? null
}

/** Bracket edges in UIT, derived from the widths so the two can't drift apart. */
function bracketRanges(): Array<{ fromUit: number; toUit: number | null }> {
  const ranges: Array<{ fromUit: number; toUit: number | null }> = []
  let used = 0
  for (const bracket of TAX_BRACKETS) {
    if (bracket.widthInUit === Infinity) {
      ranges.push({ fromUit: used, toUit: null })
    } else {
      ranges.push({ fromUit: used, toUit: used + bracket.widthInUit })
      used += bracket.widthInUit
    }
  }
  return ranges
}

/**
 * Tax on a year's gross fourth-category income.
 *
 * Works in soles units rather than cents because SUNAT rounds to whole soles,
 * and doing the same arithmetic on cents rounds in different places and lands a
 * few soles off. `overrideUit` covers a year whose UIT isn't published yet.
 */
export function incomeTax(
  grossSoles: number,
  year: number,
  overrideUit?: number,
): IncomeTaxBreakdown {
  const uit = overrideUit ?? uitForYear(year)
  if (uit === null) {
    throw new Error(
      `No UIT on record for ${year}. SUNAT publishes it in late December — ` +
        `add it to UIT_BY_YEAR, or pass one explicitly to project.`,
    )
  }

  const firstDeductionSoles = Math.round(
    Math.min(grossSoles * FIRST_DEDUCTION_RATE, FIRST_DEDUCTION_CAP_IN_UIT * uit),
  )
  const afterFirst = grossSoles - firstDeductionSoles

  // Capped at what's left: a small year can't deduct more than it earned.
  const secondDeductionSoles = Math.min(SECOND_DEDUCTION_IN_UIT * uit, afterFirst)
  const taxableBaseSoles = afterFirst - secondDeductionSoles

  const ranges = bracketRanges()
  let untaxed = taxableBaseSoles
  let totalTaxSoles = 0

  const brackets = TAX_BRACKETS.map((bracket, index) => {
    const widthSoles = bracket.widthInUit === Infinity ? null : bracket.widthInUit * uit
    let taxableSoles = 0

    if (untaxed > 0) {
      if (widthSoles === null) {
        taxableSoles = untaxed
      } else {
        taxableSoles = Math.min(widthSoles, untaxed)
        untaxed -= widthSoles
      }
    }

    const taxSoles = Math.round((taxableSoles * bracket.ratePercent) / 100)
    totalTaxSoles += taxSoles

    return {
      ratePercent: bracket.ratePercent,
      fromUit: ranges[index].fromUit,
      toUit: ranges[index].toUit,
      widthSoles,
      taxableSoles,
      taxSoles,
    }
  })

  return {
    year,
    uit,
    grossSoles,
    firstDeductionSoles,
    secondDeductionSoles,
    taxableBaseSoles,
    brackets,
    totalTaxSoles,
    effectiveRate: grossSoles === 0 ? 0 : totalTaxSoles / grossSoles,
  }
}

/**
 * How much more can be earned before the next bracket starts.
 *
 * The sheet only ever showed the total, which hides that a year can sit a few
 * hundred soles below a rate change. Null when already in the top bracket.
 */
export function headroomInCurrentBracket(breakdown: IncomeTaxBreakdown): {
  ratePercent: number
  nextRatePercent: number
  headroomSoles: number
} | null {
  const partial = breakdown.brackets.findIndex(
    (b) => b.widthSoles !== null && b.taxableSoles > 0 && b.taxableSoles < b.widthSoles,
  )
  if (partial === -1) return null
  const bracket = breakdown.brackets[partial]
  const next = breakdown.brackets[partial + 1]
  if (!next) return null
  return {
    ratePercent: bracket.ratePercent,
    nextRatePercent: next.ratePercent,
    headroomSoles: (bracket.widthSoles as number) - bracket.taxableSoles,
  }
}
