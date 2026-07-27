import { useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
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

// Windows in years, not counts of readings: "the last 12 readings" only means a
// year while sweeps stay monthly.
export const CHART_RANGES = [
  { key: '1y', label: '1Y', years: 1 },
  { key: '5y', label: '5Y', years: 5 },
  { key: 'all', label: 'All', years: null },
] as const

export type ChartRangeKey = (typeof CHART_RANGES)[number]['key']

type Hover = { index: number; left: number; top: number }

export function NetWorthSummary() {
  const { formatDate } = useDateFormat()
  const navigate = useNavigate()
  const { range } = useSearch({ strict: false }) as { range?: ChartRangeKey }
  const [hover, setHover] = useState<Hover | null>(null)

  // Everything by default — a decade of monthly readings is ~120 points, which
  // one polyline draws happily, so there's no reason to hide history on arrival.
  const selectedRange = CHART_RANGES.find((r) => r.key === range) ?? CHART_RANGES[2]

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
    if (selectedRange.years === null) return complete.slice().reverse()

    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - selectedRange.years)
    const cutoffDate = cutoff.toISOString().slice(0, 10)
    return complete.filter((r) => r.snapshot.date >= cutoffDate).reverse()
  }, [readings, selectedRange])

  const handleSelectRange = (key: ChartRangeKey) => {
    void navigate({ to: '/dashboard', search: key === 'all' ? {} : { range: key } })
  }

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

  // Snap to the nearest reading anywhere in the chart — the dots themselves are
  // a 4px target, which is not something to ask anyone to hit.
  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!path) return
    const rect = event.currentTarget.getBoundingClientRect()
    const cursorX = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH

    let nearest = 0
    for (let i = 1; i < path.length; i++) {
      if (Math.abs(path[i].x - cursorX) < Math.abs(path[nearest].x - cursorX)) nearest = i
    }

    const point = path[nearest]
    setHover({
      index: nearest,
      left: (point.x / CHART_WIDTH) * rect.width,
      top: ((point.y + 6) / (CHART_HEIGHT + 12)) * rect.height,
    })
  }

  const hovered = hover && path ? path[hover.index] : null

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
  const completeCount = readings.filter((r) => r.complete).length

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
          <div className="flex shrink-0 items-center gap-2">
            {completeCount >= 2 && (
              <div
                role="group"
                aria-label="Chart range"
                className="flex overflow-hidden rounded-lg border border-gray-200 text-xs"
              >
                {CHART_RANGES.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => handleSelectRange(option.key)}
                    aria-pressed={option.key === selectedRange.key}
                    className={`px-2.5 py-1 font-medium transition-colors ${
                      option.key === selectedRange.key
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <Link
              to="/finances/net-worth"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Add reading
            </Link>
          </div>
        </div>

        {!path && completeCount >= 2 && (
          <p className="mt-4 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            {points.length === 0 ? 'No readings fall' : 'Only one reading falls'} in the last{' '}
            {selectedRange.years} {selectedRange.years === 1 ? 'year' : 'years'} — pick a wider
            range to see the trend.
          </p>
        )}

        {path && (
          <div className="relative mt-4">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 12}`}
              className="w-full"
              style={{ overflow: 'visible' }}
              role="img"
              aria-label={`Net worth across ${points.length} complete readings. Full history is on the net worth page.`}
              onMouseMove={handleMove}
              onMouseLeave={() => setHover(null)}
            >
              {hovered && (
                <line
                  x1={hovered.x}
                  x2={hovered.x}
                  y1={0}
                  y2={CHART_HEIGHT + 12}
                  stroke="#d1d5db"
                  strokeWidth={1}
                />
              )}
              <polyline
                points={path.map((p) => `${p.x},${p.y + 6}`).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {path.map((p, i) => {
                const active = hover?.index === i
                return (
                  <circle
                    key={p.reading.snapshot.id}
                    cx={p.x}
                    cy={p.y + 6}
                    r={active ? 5.5 : i === path.length - 1 ? 4.5 : 3}
                    fill="#3b82f6"
                    stroke={active ? '#ffffff' : undefined}
                    strokeWidth={active ? 2 : undefined}
                  />
                )
              })}
            </svg>

            {hover && hovered && (
              <div
                // Centring lives in the inline transform below — Tailwind v4's
                // translate utilities set the separate `translate` property,
                // which would compose with it and shift twice.
                className="pointer-events-none absolute z-10 w-max min-w-[168px] rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg"
                style={{
                  // Keep the card inside the card, however near an edge the point sits
                  left: `clamp(96px, ${hover.left}px, calc(100% - 96px))`,
                  top: Math.max(0, hover.top - 12),
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <div className="text-xs text-gray-500">
                  {formatDate(hovered.reading.snapshot.date)}
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {formatCents(hovered.reading.total)}
                  </span>
                  {hovered.reading.delta !== null && (
                    <span
                      className={`text-xs ${
                        hovered.reading.delta >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {hovered.reading.delta >= 0 ? '+' : '−'}
                      {formatCents(Math.abs(hovered.reading.delta))}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-col gap-0.5 border-t border-gray-100 pt-1.5">
                  {sources.map((source) => {
                    const cents = hovered.reading.amounts.get(source.id)
                    if (cents == null) return null
                    return (
                      <div
                        key={source.id}
                        className="flex items-center justify-between gap-4 text-xs"
                      >
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: source.color }}
                          />
                          {source.name}
                        </span>
                        <span className="text-gray-900">{formatCents(cents)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
