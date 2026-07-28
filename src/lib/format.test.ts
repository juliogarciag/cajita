import { describe, it, expect } from 'vitest'
import { toISODate } from './format'

describe('toISODate', () => {
  // Constructed and read back in local time, so these hold in any timezone the
  // suite happens to run in — including CI on UTC.
  it('returns the local calendar date, not the UTC one', () => {
    // 10pm: already tomorrow in UTC anywhere west of Greenwich, which is what
    // made an expense entered on the evening of the 27th default to the 28th.
    expect(toISODate(new Date(2026, 6, 27, 22, 0, 0))).toBe('2026-07-27')
    // 2am: still yesterday in UTC anywhere east of it
    expect(toISODate(new Date(2026, 6, 27, 2, 0, 0))).toBe('2026-07-27')
  })

  it('pads month and day', () => {
    expect(toISODate(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05')
  })

  it('holds across a year boundary in the evening', () => {
    expect(toISODate(new Date(2026, 11, 31, 23, 30, 0))).toBe('2026-12-31')
  })
})
