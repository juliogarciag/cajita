import { describe, expect, test } from 'vitest'
import {
  buildReadings,
  visibleSources,
  latestComplete,
  daysSince,
  describeAge,
  metricTotal,
  groupSources,
  mergeCloseReadings,
  type Reading,
} from '#/lib/net-worth'
import type { WealthSource } from '#/lib/wealth-sources-collection'
import type { BalanceSnapshot } from '#/lib/balance-snapshots-collection'
import type { BalanceEntry } from '#/lib/balance-entries-collection'

const source = (id: string, overrides: Partial<WealthSource> = {}): WealthSource => ({
  id,
  name: id,
  color: '#3b82f6',
  sort_order: 0,
  archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const snapshot = (id: string, date: string): BalanceSnapshot => ({
  id,
  date,
  created_at: `${date}T00:00:00Z`,
  updated_at: `${date}T00:00:00Z`,
})

const entry = (snapshotId: string, sourceId: string, cents: number): BalanceEntry => ({
  id: `${snapshotId}-${sourceId}`,
  balance_snapshot_id: snapshotId,
  wealth_source_id: sourceId,
  amount_usd_cents: cents,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

describe('visibleSources', () => {
  test('hides archived sources that have no history', () => {
    const sources = [source('a'), source('b', { archived: true })]
    expect(visibleSources(sources, []).map((s) => s.id)).toEqual(['a'])
  })

  test('keeps archived sources that still carry history', () => {
    const sources = [source('a'), source('b', { archived: true })]
    const entries = [entry('s1', 'b', 100)]
    expect(visibleSources(sources, entries).map((s) => s.id)).toEqual(['a', 'b'])
  })

  test('orders by sort_order', () => {
    const sources = [source('b', { sort_order: 20 }), source('a', { sort_order: 10 })]
    expect(visibleSources(sources, []).map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('buildReadings', () => {
  test('returns readings newest first with summed totals', () => {
    const sources = [source('bank'), source('ibkr')]
    const snapshots = [snapshot('s1', '2026-01-15'), snapshot('s2', '2026-02-15')]
    const entries = [
      entry('s1', 'bank', 3_000_000),
      entry('s1', 'ibkr', 23_000),
      entry('s2', 'bank', 3_100_000),
      entry('s2', 'ibkr', 25_000),
    ]

    const readings = buildReadings(snapshots, entries, sources)
    expect(readings.map((r) => r.snapshot.id)).toEqual(['s2', 's1'])
    expect(readings[0].total).toBe(3_125_000)
    expect(readings[1].total).toBe(3_023_000)
  })

  test('a source is not expected before it was ever recorded', () => {
    const sources = [source('bank'), source('crypto')]
    const snapshots = [snapshot('s1', '2026-01-15'), snapshot('s2', '2026-03-15')]
    const entries = [
      entry('s1', 'bank', 3_000_000),
      entry('s2', 'bank', 3_100_000),
      entry('s2', 'crypto', 10_000),
    ]

    const readings = buildReadings(snapshots, entries, sources)
    const january = readings[1]
    // Crypto did not exist yet, so January is complete with one value
    expect(january.expected).toBe(1)
    expect(january.filled).toBe(1)
    expect(january.complete).toBe(true)
  })

  test('a source recorded earlier but missing later is a gap', () => {
    const sources = [source('bank'), source('crypto')]
    const snapshots = [snapshot('s1', '2026-01-15'), snapshot('s2', '2026-03-15')]
    const entries = [
      entry('s1', 'bank', 3_000_000),
      entry('s1', 'crypto', 10_000),
      entry('s2', 'bank', 3_100_000),
    ]

    const readings = buildReadings(snapshots, entries, sources)
    const march = readings[0]
    expect(march.expected).toBe(2)
    expect(march.filled).toBe(1)
    expect(march.complete).toBe(false)
  })

  test('archived sources stop being expected but keep their values', () => {
    const sources = [source('bank'), source('old', { archived: true })]
    const snapshots = [snapshot('s1', '2026-01-15'), snapshot('s2', '2026-03-15')]
    const entries = [
      entry('s1', 'bank', 3_000_000),
      entry('s1', 'old', 50_000),
      entry('s2', 'bank', 3_100_000),
    ]

    const readings = buildReadings(snapshots, entries, sources)
    expect(readings[0].complete).toBe(true)
    expect(readings[1].amounts.get('old')).toBe(50_000)
    expect(readings[1].complete).toBe(true)
  })

  test('deltas compare against the previous complete reading only', () => {
    const sources = [source('bank'), source('ibkr')]
    const snapshots = [
      snapshot('s1', '2026-01-15'),
      snapshot('s2', '2026-02-15'),
      snapshot('s3', '2026-03-15'),
    ]
    const entries = [
      entry('s1', 'bank', 1_000_000),
      entry('s1', 'ibkr', 100_000),
      // s2 is partial — bank only
      entry('s2', 'bank', 1_500_000),
      entry('s3', 'bank', 1_200_000),
      entry('s3', 'ibkr', 150_000),
    ]

    const readings = buildReadings(snapshots, entries, sources)
    const [march, february, january] = readings
    expect(february.complete).toBe(false)
    expect(february.delta).toBeNull()
    expect(january.delta).toBeNull()
    // March compares against January, skipping the partial February
    expect(march.delta).toBe(250_000)
  })

  test('a reading with no values at all is not complete', () => {
    const sources = [source('bank')]
    const readings = buildReadings([snapshot('s1', '2026-01-15')], [], sources)
    expect(readings[0].total).toBe(0)
    expect(readings[0].complete).toBe(false)
  })

  test('zero is a real value, not a blank', () => {
    const sources = [source('bank'), source('ibkr')]
    const snapshots = [snapshot('s1', '2026-01-15')]
    const entries = [entry('s1', 'bank', 0), entry('s1', 'ibkr', 100)]
    const readings = buildReadings(snapshots, entries, sources)
    expect(readings[0].filled).toBe(2)
    expect(readings[0].complete).toBe(true)
    expect(readings[0].amounts.get('bank')).toBe(0)
  })
})

describe('latestComplete', () => {
  test('skips a partial newest reading', () => {
    const sources = [source('bank'), source('ibkr')]
    const snapshots = [snapshot('s1', '2026-01-15'), snapshot('s2', '2026-02-15')]
    const entries = [
      entry('s1', 'bank', 1_000_000),
      entry('s1', 'ibkr', 100_000),
      entry('s2', 'bank', 1_500_000),
    ]

    const readings = buildReadings(snapshots, entries, sources)
    expect(latestComplete(readings)?.snapshot.id).toBe('s1')
  })

  test('returns null when nothing is complete', () => {
    expect(latestComplete([])).toBeNull()
  })
})

describe('daysSince / describeAge', () => {
  test('counts whole days', () => {
    expect(daysSince('2026-07-26', new Date('2026-07-26T12:00:00Z'))).toBe(0)
    expect(daysSince('2026-07-20', new Date('2026-07-26T12:00:00Z'))).toBe(6)
  })

  test('never goes negative for a future date', () => {
    expect(daysSince('2026-08-01', new Date('2026-07-26T12:00:00Z'))).toBe(0)
  })

  test('describes ages in readable units', () => {
    expect(describeAge(0)).toBe('today')
    expect(describeAge(1)).toBe('yesterday')
    expect(describeAge(3)).toBe('3 days ago')
    expect(describeAge(28)).toBe('4 weeks ago')
    expect(describeAge(90)).toBe('3 months ago')
  })
})

describe('metricTotal / groupSources', () => {
  // Julio's real shape: cash + investment + a house financed by a mortgage
  const sources = [
    source('bank', { kind: 'cash', name: 'Bank account' }),
    source('deel', { kind: 'cash', name: 'Deel' }),
    source('ibkr', { kind: 'investment', name: 'IBKR - VTI' }),
    source('house', { kind: 'property', name: 'House' }),
    source('mortgage', { kind: 'debt', name: 'Mortgage' }),
  ]
  const snapshots = [snapshot('s1', '2026-03-26')]
  const entries = [
    entry('s1', 'bank', 5_369_021),
    entry('s1', 'deel', 318_000),
    entry('s1', 'ibkr', 124_000),
    entry('s1', 'house', 40_150_000),
    entry('s1', 'mortgage', -30_041_139),
  ]
  const reading = buildReadings(snapshots, entries, sources)[0]

  test('the reading is complete and its total nets the liability', () => {
    expect(reading.complete).toBe(true)
    expect(reading.total).toBe(5_369_021 + 318_000 + 124_000 + 40_150_000 - 30_041_139)
  })

  test('liquid and equity partition net worth exactly', () => {
    const liquid = metricTotal(reading, sources, ['cash', 'investment'])
    const equity = metricTotal(reading, sources, ['property', 'debt'])
    const net = metricTotal(reading, sources, ['cash', 'investment', 'property', 'debt'])

    expect(liquid).toBe(5_369_021 + 318_000 + 124_000)
    expect(equity).toBe(40_150_000 - 30_041_139)
    // The property that makes the three views trustworthy
    expect(liquid + equity).toBe(net)
    expect(net).toBe(reading.total)
  })

  test('shares are a fraction of the group, not of net worth', () => {
    const cash = groupSources(reading, sources).find((g) => g.kind === 'cash')!
    expect(cash.subtotal).toBe(5_369_021 + 318_000)
    const bank = cash.sources.find((s) => s.source.id === 'bank')!
    // 94.4% of cash — not 28.9% of a net worth the mortgage dragged down
    expect(bank.share).toBeCloseTo(94.4, 1)
  })

  test('a group holding a liability reports no shares', () => {
    const groups = groupSources(reading, sources)
    const debt = groups.find((g) => g.kind === 'debt')!
    expect(debt.sources.every((s) => s.share === null)).toBe(true)
    // ...and the assets group is unaffected by the liability living elsewhere
    const property = groups.find((g) => g.kind === 'property')!
    expect(property.subtotal).toBe(40_150_000)
  })

  test('groups keep declaration order and omit empty kinds', () => {
    const bankOnly = [source('bank', { kind: 'cash' })]
    const groups = groupSources(
      buildReadings([snapshot('s2', '2026-01-01')], [entry('s2', 'bank', 1000)], bankOnly)[0],
      bankOnly,
    )
    expect(groups.map((g) => g.kind)).toEqual(['cash'])
  })

  test('a source with no kind counts as cash, so pre-migration rows still total', () => {
    const legacy = [source('old', {})]
    const r = buildReadings([snapshot('s3', '2026-01-01')], [entry('s3', 'old', 500)], legacy)[0]
    expect(metricTotal(r, legacy, ['cash', 'investment'])).toBe(500)
  })
})

describe('mergeCloseReadings', () => {
  // Only the date matters here; the rest is filler.
  const at = (id: string, date: string): Reading => ({
    snapshot: snapshot(id, date),
    amounts: new Map(),
    total: 0,
    filled: 1,
    expected: 1,
    complete: true,
    delta: null,
  })

  const dates = (readings: readonly Reading[]) => readings.map((r) => r.snapshot.date)

  test('leaves readings that have room to themselves alone', () => {
    const readings = [
      at('a', '2025-08-30'),
      at('b', '2025-12-30'),
      at('c', '2026-04-30'),
      at('d', '2026-08-01'),
    ]
    expect(dates(mergeCloseReadings(readings, 620))).toEqual(dates(readings))
  })

  test('a same-day pair keeps only the later reading', () => {
    const readings = [
      at('a', '2026-01-01'),
      at('b', '2026-06-01'),
      at('c', '2026-06-01'),
      at('d', '2026-12-01'),
    ]
    expect(mergeCloseReadings(readings, 620).map((r) => r.snapshot.id)).toEqual(['a', 'c', 'd'])
  })

  test('a run of same-day readings collapses to the last of them', () => {
    const readings = [
      at('a', '2026-01-01'),
      at('b', '2026-06-01'),
      at('c', '2026-06-01'),
      at('d', '2026-06-01'),
      at('e', '2026-12-01'),
    ]
    expect(mergeCloseReadings(readings, 620).map((r) => r.snapshot.id)).toEqual(['a', 'd', 'e'])
  })

  test('a next-day pair merges when a year is squeezed into the width', () => {
    const readings = [
      at('a', '2025-08-30'),
      at('b', '2026-02-27'),
      at('c', '2026-07-31'),
      at('d', '2026-08-01'),
    ]
    // A day is under two units across this span, so c and d would draw as one.
    expect(mergeCloseReadings(readings, 620).map((r) => r.snapshot.id)).toEqual(['a', 'b', 'd'])
  })

  test('a next-day pair survives when the window is short enough to show both', () => {
    const readings = [
      at('a', '2026-01-01'),
      at('b', '2026-01-15'),
      at('c', '2026-01-16'),
      at('d', '2026-02-10'),
    ]
    // Forty days across the width: a day is 15 units, so both dots have room.
    expect(dates(mergeCloseReadings(readings, 620))).toEqual(dates(readings))
  })

  test('never merges readings further apart than a day, however tight the scale', () => {
    const readings = [
      at('a', '2016-01-01'),
      at('b', '2025-12-01'),
      at('c', '2025-12-31'),
      at('d', '2026-01-30'),
    ]
    // A decade across the width puts these monthly readings five units apart —
    // inside the overlap threshold, but they are movement, not corrections.
    expect(dates(mergeCloseReadings(readings, 620))).toEqual(dates(readings))
  })

  test('keeps the first reading, which every delta on the card measures from', () => {
    const readings = [
      at('a', '2026-01-01'),
      at('b', '2026-01-02'),
      at('c', '2026-06-01'),
      at('d', '2026-11-28'),
    ]
    expect(mergeCloseReadings(readings, 620).map((r) => r.snapshot.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  test('leaves a pair untouched — there is no middle to merge', () => {
    const readings = [at('a', '2026-08-01'), at('b', '2026-08-02')]
    expect(dates(mergeCloseReadings(readings, 620))).toEqual(dates(readings))
  })
})
