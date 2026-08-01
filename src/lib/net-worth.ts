// Pure derivations for net worth readings.
//
// A reading is one dated sweep across the wealth sources. Because every source
// is captured in the same sitting, a reading's total is a real number — there
// is no carrying forward of stale per-source values.

import { sourceKind, type WealthSource } from '#/lib/wealth-sources-collection'
import { WEALTH_KINDS } from '#/lib/wealth-kinds'
import type { BalanceSnapshot } from '#/lib/balance-snapshots-collection'
import type { BalanceEntry } from '#/lib/balance-entries-collection'
import { toISODate } from '#/lib/format'

export type Reading = {
  snapshot: BalanceSnapshot
  /** Source id → amount in cents. A missing key means the cell is empty. */
  amounts: Map<string, number>
  total: number
  /** Cells filled in this reading. */
  filled: number
  /** Cells that ought to be filled, given what was being tracked by then. */
  expected: number
  complete: boolean
  /** Change against the previous complete reading; null when either is partial. */
  delta: number | null
}

/**
 * Columns worth showing: everything still active, plus archived sources that
 * still carry history so past readings stay readable.
 */
export function visibleSources(
  sources: readonly WealthSource[],
  entries: readonly BalanceEntry[],
): WealthSource[] {
  const withHistory = new Set(entries.map((e) => e.wealth_source_id))
  return sources
    .filter((s) => !s.archived || withHistory.has(s.id))
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/**
 * Readings newest first, each with its total and completeness.
 *
 * A source counts as "expected" in a reading once it has been recorded in that
 * reading or in an earlier one — that's what separates a cell you forgot from
 * an account that simply didn't exist yet. Archived sources stop being expected
 * but keep any values they already have.
 */
export function buildReadings(
  snapshots: readonly BalanceSnapshot[],
  entries: readonly BalanceEntry[],
  sources: readonly WealthSource[],
): Reading[] {
  const byDateAsc = snapshots
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))

  const dateOf = new Map(snapshots.map((s) => [s.id, s.date]))

  // Earliest reading date at which each source was recorded
  const firstSeen = new Map<string, string>()
  for (const entry of entries) {
    const date = dateOf.get(entry.balance_snapshot_id)
    if (!date) continue
    const current = firstSeen.get(entry.wealth_source_id)
    if (current == null || date < current) firstSeen.set(entry.wealth_source_id, date)
  }

  const amountsBySnapshot = new Map<string, Map<string, number>>()
  for (const entry of entries) {
    let map = amountsBySnapshot.get(entry.balance_snapshot_id)
    if (!map) {
      map = new Map<string, number>()
      amountsBySnapshot.set(entry.balance_snapshot_id, map)
    }
    map.set(entry.wealth_source_id, entry.amount_usd_cents)
  }

  const ascending: Reading[] = byDateAsc.map((snapshot) => {
    const amounts = amountsBySnapshot.get(snapshot.id) ?? new Map<string, number>()
    let total = 0
    for (const amount of amounts.values()) total += amount

    let expected = 0
    for (const source of sources) {
      if (amounts.has(source.id)) {
        expected++
        continue
      }
      if (source.archived) continue
      const seen = firstSeen.get(source.id)
      if (seen != null && seen <= snapshot.date) expected++
    }

    const filled = amounts.size
    return {
      snapshot,
      amounts,
      total,
      filled,
      expected,
      complete: expected > 0 && filled === expected,
      delta: null,
    }
  })

  // Compare like with like: a partial reading is not a fair baseline
  let previousCompleteTotal: number | null = null
  for (const reading of ascending) {
    if (!reading.complete) continue
    if (previousCompleteTotal !== null) reading.delta = reading.total - previousCompleteTotal
    previousCompleteTotal = reading.total
  }

  return ascending.reverse()
}

/** The newest reading whose cells are all filled — what the headline reports. */
export function latestComplete(readings: readonly Reading[]): Reading | null {
  return readings.find((r) => r.complete) ?? null
}

/**
 * A reading's total restricted to one metric's kinds.
 *
 * Completeness deliberately stays a property of the whole reading rather than
 * of the metric: a reading missing its mortgage is a reading you haven't
 * finished, and letting the Liquid view quietly accept it would mean the same
 * date counted as reliable in one view and not another.
 */
export function metricTotal(
  reading: Reading,
  sources: readonly WealthSource[],
  kinds: readonly string[],
): number {
  let total = 0
  for (const source of sources) {
    if (!kinds.includes(sourceKind(source))) continue
    total += reading.amounts.get(source.id) ?? 0
  }
  return total
}

export type SourceGroup = {
  kind: string
  label: string
  subtotal: number
  sources: { source: WealthSource; amount: number; share: number | null }[]
}

/**
 * Sources grouped by kind, in the order the kinds are declared, with subtotals.
 *
 * `share` is a source's fraction of its own group, not of net worth — dividing
 * by a total that a liability has pulled downward produces figures like 215%
 * and −144%. A group holding any negative amount reports no shares at all,
 * because a percentage of a mixed-sign total means nothing; there the subtotal
 * is the number that carries the meaning.
 */
export function groupSources(reading: Reading, sources: readonly WealthSource[]): SourceGroup[] {
  return WEALTH_KINDS.map(({ key, label }) => {
    const inKind = sources.filter((s) => sourceKind(s) === key)
    const rows = inKind
      .map((source) => ({ source, amount: reading.amounts.get(source.id) }))
      .filter((r): r is { source: WealthSource; amount: number } => r.amount != null)

    const subtotal = rows.reduce((sum, r) => sum + r.amount, 0)
    const anyNegative = rows.some((r) => r.amount < 0)

    return {
      kind: key,
      label,
      subtotal,
      sources: rows.map((r) => ({
        source: r.source,
        amount: r.amount,
        share: anyNegative || subtotal === 0 ? null : (r.amount / subtotal) * 100,
      })),
    }
  }).filter((g) => g.sources.length > 0)
}

const DAY_MS = 86_400_000

/** Midnight UTC for a YYYY-MM-DD, so gaps between readings measure in days. */
export function dateMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

/**
 * The readings a time-scaled chart should actually draw, given how many
 * horizontal units it has to draw them in.
 *
 * On a time axis, readings taken within a day of each other land on top of
 * each other — at a year's span a day is barely two pixels. Two readings on
 * one date are one sitting recorded twice, so only the later stands; a
 * next-day pair merges too, but only when it would otherwise overlap. The
 * later reading always wins: a balance is a state, not an event, so the newer
 * figure is simply the truer one.
 *
 * Two rules keep it from lying. Nothing more than `maxDays` apart ever merges,
 * however tight the scale draws it — otherwise a decade-long window would
 * swallow whole months. And the first reading is never merged away: it is the
 * baseline every delta on the card is measured from, so a close pair at the
 * very start is left to overlap rather than move it. The newest always
 * survives.
 */
export function mergeCloseReadings(
  readings: readonly Reading[],
  chartUnits: number,
  { minGap = 6, maxDays = 1 }: { minGap?: number; maxDays?: number } = {},
): Reading[] {
  if (readings.length < 3) return readings.slice()

  const elapsedDays =
    (dateMs(readings[readings.length - 1].snapshot.date) - dateMs(readings[0].snapshot.date)) /
    DAY_MS
  const unitsPerDay = elapsedDays > 0 ? chartUnits / elapsedDays : 0

  const kept: Reading[] = [readings[0]]
  for (const reading of readings.slice(1)) {
    const gapDays =
      (dateMs(reading.snapshot.date) - dateMs(kept[kept.length - 1].snapshot.date)) / DAY_MS
    const merges = gapDays === 0 || (gapDays <= maxDays && gapDays * unitsPerDay < minGap)
    if (merges && kept.length > 1) kept[kept.length - 1] = reading
    else kept.push(reading)
  }
  return kept
}

export function daysSince(date: string, today: Date): number {
  const then = Date.parse(`${date}T00:00:00Z`)
  // Local calendar date, not UTC — otherwise a reading taken today reads as
  // "yesterday" all evening in a western timezone.
  const now = Date.parse(`${toISODate(today)}T00:00:00Z`)
  return Math.max(0, Math.round((now - then) / 86_400_000))
}

/** "4 weeks ago" / "today" — how stale the newest reading is. */
export function describeAge(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.round(days / 7)
  if (weeks < 9) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  const months = Math.round(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}
