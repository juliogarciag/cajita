import { describe, expect, test } from 'vitest'
import {
  buildReadings,
  visibleSources,
  latestComplete,
  daysSince,
  describeAge,
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
