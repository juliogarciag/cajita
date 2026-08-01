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
  metricTotal,
  groupSources,
  mergeCloseReadings,
  dateMs,
  type Reading,
} from '#/lib/net-worth.js'
import { METRICS, DEFAULT_METRIC, metricKinds, type MetricKey } from '#/lib/wealth-kinds.js'
import { sourceKind } from '#/lib/wealth-sources-collection.js'
import { formatCents, toISODate } from '#/lib/format.js'
import { useDateFormat } from '#/lib/date-format.js'

const CHART_WIDTH = 620
const CHART_HEIGHT = 120

// One dot diameter. Closer than this and two readings draw as a single blob.
const MERGE_GAP = 6
// A few days is one sitting — a sweep finished over a weekend, or a figure
// corrected once the statement landed. Past that it's movement, however tight
// the range draws it: without a cap, "All" over a decade would merge months.
// At 1Y the gap above is already ~3.3 days, so this only bites on wider ranges.
const MERGE_MAX_DAYS = 3

// Windows in years, not counts of readings: "the last 12 readings" only means a
// year while sweeps stay monthly.
export const CHART_RANGES = [
  { key: '1y', label: '1Y', years: 1 },
  { key: '3y', label: '3Y', years: 3 },
  { key: '5y', label: '5Y', years: 5 },
  { key: 'all', label: 'All', years: null },
] as const

export type ChartRangeKey = (typeof CHART_RANGES)[number]['key']

type Hover = { index: number; left: number; top: number }

/** Axis ticks want to be readable in a narrow gutter, not exact: "$53.7k". */
function compactUsd(cents: number): string {
  const dollars = cents / 100
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${Math.round(dollars)}`
}

export function NetWorthSummary() {
  const { formatDate } = useDateFormat()
  const navigate = useNavigate()
  const { range, metric } = useSearch({ strict: false }) as {
    range?: ChartRangeKey
    metric?: MetricKey
  }
  const [hover, setHover] = useState<Hover | null>(null)

  // A year by default — the window the dashboard is usually asked about. The
  // longer ranges compress recent months into the right-hand edge, where the
  // detail worth seeing is.
  const selectedRange = CHART_RANGES.find((r) => r.key === range) ?? CHART_RANGES[0]

  const { data: allSources } = useLiveQuery((q) => q.from({ s: wealthSourcesCollection }))
  const { data: snapshots } = useLiveQuery((q) => q.from({ b: balanceSnapshotsCollection }))
  const { data: entries } = useLiveQuery((q) => q.from({ e: balanceEntriesCollection }))

  const readings = useMemo(
    () => buildReadings(snapshots, entries, allSources),
    [snapshots, entries, allSources],
  )
  const sources = useMemo(() => visibleSources(allSources, entries), [allSources, entries])

  const selectedMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0]
  // Every figure on this card — headline, delta, chart, axis — is the selected
  // metric's slice of a reading, never the reading's raw total.
  const valueOf = useMemo(() => {
    const kinds = metricKinds(selectedMetric.key)
    return (r: Reading) => metricTotal(r, sources, kinds)
  }, [selectedMetric, sources])

  const headline = latestComplete(readings)

  // The newest reading full stop, complete or not. When it isn't complete the
  // headline silently falls back to an older one, which is worth saying rather
  // than leaving a stale date to be noticed.
  const newest = readings[0] ?? null
  const staleBecauseIncomplete =
    newest && headline && !newest.complete && newest.snapshot.id !== headline.snapshot.id
      ? newest
      : null

  // Only complete readings are plotted — a half-filled sweep would read as a crash
  const points = useMemo(() => {
    const complete = readings.filter((r) => r.complete)
    if (selectedRange.years === null) return complete.slice().reverse()

    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - selectedRange.years)
    const cutoffDate = toISODate(cutoff)
    return complete.filter((r) => r.snapshot.date >= cutoffDate).reverse()
  }, [readings, selectedRange])

  // Both controls live in the URL, so a view is linkable — and each has to
  // preserve the other rather than resetting it.
  const goTo = (next: { range?: ChartRangeKey; metric?: MetricKey }) => {
    const r = next.range ?? selectedRange.key
    const m = next.metric ?? selectedMetric.key
    void navigate({
      to: '/dashboard',
      search: {
        ...(r === '1y' ? {} : { range: r }),
        ...(m === DEFAULT_METRIC ? {} : { metric: m }),
      },
    })
  }

  // Readings within a day of each other draw on top of each other at this
  // scale, so the chart plots one of them — see mergeCloseReadings.
  const plotted = useMemo(
    () => mergeCloseReadings(points, CHART_WIDTH, { minGap: MERGE_GAP, maxDays: MERGE_MAX_DAYS }),
    [points],
  )

  const bounds = useMemo(() => {
    if (plotted.length < 2) return null
    const totals = plotted.map(valueOf)
    return { min: Math.min(...totals), max: Math.max(...totals) }
  }, [plotted, valueOf])

  // The horizontal axis is time, not reading number: two sweeps a week apart
  // sit a week apart, and a three-month gap reads as a three-month gap.
  const path = useMemo(() => {
    if (!bounds || plotted.length < 2) return null
    const span = bounds.max - bounds.min || 1
    const first = dateMs(plotted[0].snapshot.date)
    const elapsed = dateMs(plotted[plotted.length - 1].snapshot.date) - first
    return plotted.map((p, i) => {
      // Two readings on one date survive merging only at the very start, where
      // the first is pinned. They have no time to spread across, so space them
      // evenly rather than stacking them on the left edge.
      const x =
        elapsed === 0
          ? Math.round((i / (plotted.length - 1)) * CHART_WIDTH)
          : Math.round(((dateMs(p.snapshot.date) - first) / elapsed) * CHART_WIDTH)
      const y = Math.round(CHART_HEIGHT - ((valueOf(p) - bounds.min) / span) * CHART_HEIGHT)
      return { x, y, reading: p }
    })
  }, [plotted, bounds, valueOf])

  // Halfway along the axis in time. Kept in UTC — these are calendar dates
  // anchored at midnight UTC, and a local reading of the midpoint would land a
  // day off west of Greenwich.
  const midpointDate = useMemo(() => {
    if (plotted.length < 2) return ''
    const middle =
      (dateMs(plotted[0].snapshot.date) + dateMs(plotted[plotted.length - 1].snapshot.date)) / 2
    return new Date(middle).toISOString().slice(0, 10)
  }, [plotted])

  // Change across the visible window rather than since the previous reading —
  // the number sits beside the range buttons, so it should answer the question
  // those buttons ask. "All" has no window to measure from, so it shows nothing.
  const baseline = selectedRange.years !== null && plotted.length >= 2 ? plotted[0] : null
  const periodDelta = baseline ? valueOf(plotted[plotted.length - 1]) - valueOf(baseline) : null

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

  const metricSources = useMemo(() => {
    const kinds = metricKinds(selectedMetric.key)
    return sources.filter((s) => kinds.includes(sourceKind(s)))
  }, [sources, selectedMetric])

  // Against the previous plotted point rather than the reading's own delta,
  // which is computed on the raw total and would disagree with the metric.
  const hoveredDelta =
    hover && hover.index > 0 && plotted[hover.index] && plotted[hover.index - 1]
      ? valueOf(plotted[hover.index]) - valueOf(plotted[hover.index - 1])
      : null

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

  const completeCount = readings.filter((r) => r.complete).length

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-gray-500">{selectedMetric.label}</div>
            <div className="mt-0.5 flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-gray-900">
                {formatCents(valueOf(headline))}
              </span>
              {periodDelta !== null && (
                <span className="flex items-baseline gap-1.5">
                  <span
                    className={`text-sm ${periodDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {periodDelta >= 0 ? '+' : '−'}
                    {formatCents(Math.abs(periodDelta))}
                  </span>
                  <span className="text-xs text-gray-400">over {selectedRange.label}</span>
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">
              {formatDate(headline.snapshot.date)} ·{' '}
              {describeAge(daysSince(headline.snapshot.date, new Date()))}
            </div>
            {staleBecauseIncomplete && (
              <div className="mt-1.5 text-xs text-amber-600">
                <Link to="/finances/net-worth" className="hover:underline">
                  {formatDate(staleBecauseIncomplete.snapshot.date)} is only{' '}
                  {staleBecauseIncomplete.filled} of {staleBecauseIncomplete.expected} — finish it
                  to bring it in
                </Link>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {/* Views, not filters: liquid and equity partition net worth, so
                these three answer different questions about the same reading. */}
            <div
              role="group"
              aria-label="Metric"
              className="flex overflow-hidden rounded-lg border border-gray-200 text-xs"
            >
              {METRICS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => goTo({ metric: option.key })}
                  aria-pressed={option.key === selectedMetric.key}
                  className={`px-2.5 py-1 font-medium transition-colors ${
                    option.key === selectedMetric.key
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {completeCount >= 2 && (
                <div
                  role="group"
                  aria-label="Chart range"
                  className="flex overflow-hidden rounded-lg border border-gray-200 text-xs"
                >
                  {CHART_RANGES.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => goTo({ range: option.key })}
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
            </div>
          </div>
        </div>

        {!path && completeCount >= 2 && (
          <p className="mt-4 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            {points.length === 0 ? 'No readings fall' : 'Only one reading falls'} in the last{' '}
            {selectedRange.years} {selectedRange.years === 1 ? 'year' : 'years'} — pick a wider
            range to see the trend.
          </p>
        )}

        {path && bounds && (
          <div className="mt-4 flex gap-3">
            {/* Value axis. Text lives outside the SVG because the SVG scales to
                the container width, which would scale any text inside it too. */}
            <div className="flex w-12 shrink-0 flex-col justify-between py-[5px] text-right text-[11px] text-gray-400 tabular-nums">
              <span>{compactUsd(bounds.max)}</span>
              <span>{compactUsd((bounds.max + bounds.min) / 2)}</span>
              <span>{compactUsd(bounds.min)}</span>
            </div>

            <div className="relative min-w-0 flex-1">
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 12}`}
                className="w-full"
                style={{ overflow: 'visible' }}
                role="img"
                aria-label={`Net worth across ${plotted.length} complete readings, ${formatDate(plotted[0].snapshot.date)} to ${formatDate(plotted[plotted.length - 1].snapshot.date)}.`}
                onMouseMove={handleMove}
                onMouseLeave={() => setHover(null)}
              >
                {[6, CHART_HEIGHT / 2 + 6, CHART_HEIGHT + 6].map((y) => (
                  <line
                    key={y}
                    x1={0}
                    x2={CHART_WIDTH}
                    y1={y}
                    y2={y}
                    stroke="#f3f4f6"
                    strokeWidth={1}
                  />
                ))}
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
                      {formatCents(valueOf(hovered.reading))}
                    </span>
                    {hoveredDelta !== null && (
                      <span
                        className={`text-xs ${
                          hoveredDelta >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {hoveredDelta >= 0 ? '+' : '−'}
                        {formatCents(Math.abs(hoveredDelta))}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-col gap-0.5 border-t border-gray-100 pt-1.5">
                    {/* Only the sources this metric counts — the Liquid view
                        shouldn't list a house it isn't adding up. */}
                    {metricSources.map((source) => {
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

              {/* Date axis. A midpoint tick gives the horizontal span a scale;
                  with 60 monthly readings the two ends alone don't. It's the
                  halfway *date* — the tick sits at the centre of the axis, and
                  on a time axis no reading need fall there. */}
              <div className="mt-1 flex justify-between text-xs text-gray-400 tabular-nums">
                <span>{formatDate(plotted[0].snapshot.date)}</span>
                {plotted.length > 2 && <span>{formatDate(midpointDate)}</span>}
                <span>{formatDate(plotted[plotted.length - 1].snapshot.date)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grouped by kind with subtotals, and restricted to the selected metric
          so the list adds up to the headline above it. Shares are a fraction of
          the group, so a mortgage in Debt can't distort the composition of Cash. */}
      <div className="flex flex-col gap-3">
        {groupSources(headline, metricSources).map((group) => (
          <div
            key={group.kind}
            className="overflow-hidden rounded-lg border border-gray-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {group.label}
              </span>
              <span className="text-sm font-medium tabular-nums text-gray-900">
                {formatCents(group.subtotal)}
              </span>
            </div>
            {group.sources.map(({ source, amount, share }) => {
              // Same window as the headline, so the two can't disagree.
              const before = baseline?.amounts.get(source.id)
              const change = before == null ? null : amount - before

              return (
                <div
                  key={source.id}
                  className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 last:border-b-0"
                >
                  <span className="flex items-center gap-2 text-sm text-gray-900">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: source.color }}
                    />
                    {source.name}
                  </span>
                  <span className="flex items-baseline gap-4">
                    <span className="w-12 text-right text-xs tabular-nums text-gray-400">
                      {share === null ? '—' : `${share.toFixed(1)}%`}
                    </span>
                    <span
                      className={`w-20 text-right text-xs tabular-nums ${
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
                    <span className="w-24 text-right text-sm tabular-nums text-gray-900">
                      {formatCents(amount)}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
