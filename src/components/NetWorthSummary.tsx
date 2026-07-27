import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Link } from '@tanstack/react-router'
import { wealthSourcesCollection } from '#/lib/wealth-sources-collection.js'
import { balanceSnapshotsCollection } from '#/lib/balance-snapshots-collection.js'
import { balanceEntriesCollection } from '#/lib/balance-entries-collection.js'
import {
  buildReadings,
  visibleSources,
  latestComplete,
  daysSince,
  describeAge,
} from '#/lib/net-worth.js'
import { formatCents } from '#/lib/format.js'
import { useDateFormat } from '#/lib/date-format.js'

const CHART_WIDTH = 620
const CHART_HEIGHT = 120
const MAX_POINTS = 12

export function NetWorthSummary() {
  const { formatDate } = useDateFormat()

  const { data: allSources } = useLiveQuery((q) => q.from({ s: wealthSourcesCollection }))
  const { data: snapshots } = useLiveQuery((q) => q.from({ b: balanceSnapshotsCollection }))
  const { data: entries } = useLiveQuery((q) => q.from({ e: balanceEntriesCollection }))

  const readings = useMemo(
    () => buildReadings(snapshots, entries, allSources),
    [snapshots, entries, allSources],
  )
  const sources = useMemo(() => visibleSources(allSources, entries), [allSources, entries])

  const headline = latestComplete(readings)

  // Only complete readings are plotted — a half-filled sweep would read as a crash
  const points = useMemo(() => {
    const complete = readings.filter((r) => r.complete)
    return complete.slice(0, MAX_POINTS).reverse()
  }, [readings])

  const path = useMemo(() => {
    if (points.length < 2) return null
    const totals = points.map((p) => p.total)
    const min = Math.min(...totals)
    const max = Math.max(...totals)
    const span = max - min || 1
    const step = CHART_WIDTH / (points.length - 1)
    return points.map((p, i) => {
      const x = Math.round(i * step)
      const y = Math.round(CHART_HEIGHT - ((p.total - min) / span) * CHART_HEIGHT)
      return { x, y, reading: p }
    })
  }, [points])

  if (!headline) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium text-gray-700">Net worth</h2>
        <p className="mt-1 text-sm text-gray-500">
          No complete readings yet.{' '}
          <Link to="/finances/net-worth" className="text-blue-600 hover:underline">
            Record your balances
          </Link>{' '}
          to start tracking.
        </p>
      </div>
    )
  }

  const previous = readings.filter((r) => r.complete)[1] ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-gray-500">Net worth</div>
            <div className="mt-0.5 flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-gray-900">
                {formatCents(headline.total)}
              </span>
              {headline.delta !== null && (
                <span
                  className={`text-sm ${headline.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {headline.delta >= 0 ? '+' : '−'}
                  {formatCents(Math.abs(headline.delta))}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">
              {formatDate(headline.snapshot.date)} ·{' '}
              {describeAge(daysSince(headline.snapshot.date, new Date()))}
            </div>
          </div>
          <Link
            to="/finances/net-worth"
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Add reading
          </Link>
        </div>

        {path && (
          <div className="mt-4">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 12}`}
              className="w-full"
              style={{ overflow: 'visible' }}
              role="img"
              aria-label={`Net worth across the last ${points.length} complete readings`}
            >
              <polyline
                points={path.map((p) => `${p.x},${p.y + 6}`).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {path.map((p, i) => (
                <circle
                  key={p.reading.snapshot.id}
                  cx={p.x}
                  cy={p.y + 6}
                  r={i === path.length - 1 ? 4.5 : 3}
                  fill="#3b82f6"
                >
                  <title>
                    {formatDate(p.reading.snapshot.date)} — {formatCents(p.reading.total)}
                  </title>
                </circle>
              ))}
            </svg>
            <div className="mt-1 flex justify-between text-xs text-gray-400">
              <span>{formatDate(points[0].snapshot.date)}</span>
              <span>{formatDate(points[points.length - 1].snapshot.date)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {sources.map((source) => {
          const current = headline.amounts.get(source.id)
          if (current == null) return null
          const before = previous?.amounts.get(source.id)
          const change = before == null ? null : current - before
          const share = headline.total === 0 ? 0 : (current / headline.total) * 100

          return (
            <div
              key={source.id}
              className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 last:border-b-0"
            >
              <span className="flex items-center gap-2 text-sm text-gray-900">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: source.color }} />
                {source.name}
              </span>
              <span className="flex items-baseline gap-4">
                <span className="w-12 text-right text-xs text-gray-400">{share.toFixed(1)}%</span>
                <span
                  className={`w-20 text-right text-xs ${
                    change == null
                      ? 'text-gray-300'
                      : change >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                  }`}
                >
                  {change == null
                    ? '—'
                    : `${change >= 0 ? '+' : '−'}${formatCents(Math.abs(change))}`}
                </span>
                <span className="w-24 text-right text-sm text-gray-900">
                  {formatCents(current)}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
