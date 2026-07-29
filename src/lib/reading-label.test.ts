import { describe, it, expect } from 'vitest'
import { defaultReadingLabel, sameMonth } from './reading-label.js'

describe('defaultReadingLabel', () => {
  it('names a reading after its month', () => {
    expect(defaultReadingLabel('2026-03-14', [])).toBe('March reading')
    expect(defaultReadingLabel('2026-12-31', [])).toBe('December reading')
  })

  it('numbers the second reading of a month', () => {
    expect(defaultReadingLabel('2026-03-28', ['March reading'])).toBe('March reading 2')
    expect(defaultReadingLabel('2026-03-30', ['March reading', 'March reading 2'])).toBe(
      'March reading 3',
    )
  })

  it('fills the gap a deleted reading leaves rather than counting on', () => {
    expect(defaultReadingLabel('2026-03-30', ['March reading', 'March reading 3'])).toBe(
      'March reading 2',
    )
  })

  it('ignores names that are not the default', () => {
    expect(defaultReadingLabel('2026-03-30', ['Before the move'])).toBe('March reading')
  })
})

describe('sameMonth', () => {
  it('compares year and month only', () => {
    expect(sameMonth('2026-03-01', '2026-03-31')).toBe(true)
    expect(sameMonth('2026-03-31', '2026-04-01')).toBe(false)
    expect(sameMonth('2025-03-01', '2026-03-01')).toBe(false)
  })
})
