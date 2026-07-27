// Pure derivations for net worth readings.
//
// A reading is one dated sweep across the wealth sources. Because every source
// is captured in the same sitting, a reading's total is a real number — there
// is no carrying forward of stale per-source values.

import type { WealthSource } from '#/lib/wealth-sources-collection'
import type { BalanceSnapshot } from '#/lib/balance-snapshots-collection'
import type { BalanceEntry } from '#/lib/balance-entries-collection'

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

export function daysSince(date: string, today: Date): number {
  const then = Date.parse(`${date}T00:00:00Z`)
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`)
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
