import { describe, expect, it } from 'vitest'
import { UIT_BY_YEAR, headroomInCurrentBracket, incomeTax, uitForYear } from './income-tax.js'

/**
 * The spreadsheet is the reference implementation. These are its own cached
 * outputs, read straight out of the export — gross income as the sheet summed
 * it, against the tax its custom function returned. If a change here breaks one
 * of these, the port has drifted from five years of filed returns.
 */
const SHEET = [
  { year: 2022, grossSoles: 389520.1457, totalTaxSoles: 54155 },
  { year: 2023, grossSoles: 475841.465, totalTaxSoles: 71880 },
  { year: 2024, grossSoles: 449416.0604, totalTaxSoles: 63828 },
  { year: 2025, grossSoles: 513922.662, totalTaxSoles: 77599 },
  { year: 2026, grossSoles: 285857.8305, totalTaxSoles: 27382 },
]

describe('incomeTax — against the spreadsheet', () => {
  for (const { year, grossSoles, totalTaxSoles } of SHEET) {
    it(`reproduces ${year} exactly`, () => {
      expect(incomeTax(grossSoles, year).totalTaxSoles).toBe(totalTaxSoles)
    })
  }

  // The sheet's "Porcentaje Total" cell, to 10 places.
  it('matches the percentage the sheet reported for 2025', () => {
    expect(incomeTax(513922.662, 2025).effectiveRate).toBeCloseTo(0.1509935361, 10)
  })

  it('matches the percentage the sheet reported for 2026', () => {
    expect(incomeTax(285857.8305, 2026).effectiveRate).toBeCloseTo(0.09578887502, 10)
  })
})

describe('incomeTax — deductions', () => {
  it('takes 20% then 7 UIT, and the brackets see what is left', () => {
    const result = incomeTax(513922.662, 2025)
    expect(result.uit).toBe(5350)
    expect(result.firstDeductionSoles).toBe(102785) // round(20% of gross)
    expect(result.secondDeductionSoles).toBe(37450) // 7 UIT
    expect(result.taxableBaseSoles).toBeCloseTo(373687.662, 6)
  })

  it('caps the 20% deduction at 24 UIT', () => {
    // 24 UIT is reached at a gross of 24/0.2 = 120 UIT.
    const uit = UIT_BY_YEAR[2025]
    const result = incomeTax(200 * uit, 2025)
    expect(result.firstDeductionSoles).toBe(24 * uit)
  })

  it('leaves the 20% deduction uncapped below that threshold', () => {
    const result = incomeTax(100 * UIT_BY_YEAR[2025], 2025)
    expect(result.firstDeductionSoles).toBe(20 * UIT_BY_YEAR[2025])
  })

  it('never deducts more than was earned', () => {
    const result = incomeTax(1000, 2025)
    expect(result.secondDeductionSoles).toBe(800) // what's left after the 20%
    expect(result.taxableBaseSoles).toBe(0)
    expect(result.totalTaxSoles).toBe(0)
  })

  it('owes nothing on an income the deductions cover', () => {
    // Below 8.75 UIT the two deductions wipe out the base entirely.
    expect(incomeTax(8 * UIT_BY_YEAR[2026], 2026).totalTaxSoles).toBe(0)
  })

  it('reports a zero rate on no income rather than NaN', () => {
    const result = incomeTax(0, 2026)
    expect(result.totalTaxSoles).toBe(0)
    expect(result.effectiveRate).toBe(0)
  })
})

describe('incomeTax — brackets', () => {
  it('fills brackets in order and stops where the base runs out', () => {
    const result = incomeTax(285857.8305, 2026)
    const filled = result.brackets.map((b) => ({
      rate: b.ratePercent,
      taxable: Math.round(b.taxableSoles * 100) / 100,
      tax: b.taxSoles,
    }))
    expect(filled).toEqual([
      { rate: 8, taxable: 27500, tax: 2200 },
      { rate: 14, taxable: 82500, tax: 11550 },
      { rate: 17, taxable: 80185.83, tax: 13632 },
      { rate: 20, taxable: 0, tax: 0 },
      { rate: 30, taxable: 0, tax: 0 },
    ])
  })

  it('spills into the top bracket, which has no ceiling', () => {
    const result = incomeTax(513922.662, 2025)
    const top = result.brackets[4]
    expect(top.ratePercent).toBe(30)
    expect(top.widthSoles).toBeNull()
    expect(top.toUit).toBeNull()
    expect(top.taxableSoles).toBeCloseTo(132937.662, 6)
    expect(top.taxSoles).toBe(39881)
  })

  it('sums the per-bracket tax to the total', () => {
    for (const { year, grossSoles } of SHEET) {
      const result = incomeTax(grossSoles, year)
      const summed = result.brackets.reduce((total, b) => total + b.taxSoles, 0)
      expect(summed).toBe(result.totalTaxSoles)
    }
  })

  it('keeps rates as whole percents, so they print cleanly', () => {
    // Stored as 0.14 this reads 14.000000000000002, and these get displayed.
    const rates = incomeTax(285857.8305, 2026).brackets.map((b) => String(b.ratePercent))
    expect(rates).toEqual(['8', '14', '17', '20', '30'])
  })

  it('derives bracket edges from the widths', () => {
    const edges = incomeTax(1, 2026).brackets.map((b) => [b.fromUit, b.toUit])
    expect(edges).toEqual([
      [0, 5],
      [5, 20],
      [20, 35],
      [35, 45],
      [45, null],
    ])
  })
})

describe('headroomInCurrentBracket', () => {
  it('reports what is left before the next rate applies', () => {
    // 2026 sits partway through the 17% bracket.
    const headroom = headroomInCurrentBracket(incomeTax(285857.8305, 2026))
    expect(headroom).not.toBeNull()
    expect(headroom?.ratePercent).toBe(17)
    expect(headroom?.nextRatePercent).toBe(20)
    expect(headroom?.headroomSoles).toBeCloseTo(2314.17, 2)
  })

  it('reports none once the top bracket is in play', () => {
    // 2025 fills every capped bracket, so there is no rate left to cross.
    expect(headroomInCurrentBracket(incomeTax(513922.662, 2025))).toBeNull()
  })

  it('reports none when nothing is taxable', () => {
    expect(headroomInCurrentBracket(incomeTax(0, 2026))).toBeNull()
  })
})

describe('uitForYear', () => {
  it('returns the published figure', () => {
    expect(uitForYear(2026)).toBe(5500)
  })

  it('returns null for a year SUNAT has not published yet', () => {
    expect(uitForYear(2027)).toBeNull()
  })

  it('refuses to invent a UIT rather than answering with a guess', () => {
    expect(() => incomeTax(100000, 2027)).toThrow(/No UIT on record for 2027/)
  })

  it('accepts an override so a new year can still be projected', () => {
    const result = incomeTax(100000, 2027, 5600)
    expect(result.uit).toBe(5600)
    expect(result.totalTaxSoles).toBeGreaterThan(0)
  })
})
