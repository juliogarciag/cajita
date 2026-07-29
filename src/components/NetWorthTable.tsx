import { Fragment, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Plus, Download, Trash2, Settings2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { wealthSourcesCollection } from '#/lib/wealth-sources-collection.js'
import { balanceSnapshotsCollection } from '#/lib/balance-snapshots-collection.js'
import { balanceEntriesCollection } from '#/lib/balance-entries-collection.js'
import {
  type Reading,
  buildReadings,
  visibleSources,
  latestComplete,
  daysSince,
  describeAge,
} from '#/lib/net-worth.js'
import { formatCents } from '#/lib/format.js'
import { useDateFormat } from '#/lib/date-format.js'
import { deleteBalanceSnapshot } from '#/server/balance-snapshots.js'
import { ReadingDialog } from './ReadingDialog.js'
import { ConfirmButton } from './ConfirmButton.js'
import { WealthSourcesPanel } from './WealthSourcesPanel.js'

export function NetWorthTable() {
  const { formatDate } = useDateFormat()
  const [showSources, setShowSources] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  // The reading the dialog is pointed at; null means it records a new one.
  const [editing, setEditing] = useState<Reading | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: allSources } = useLiveQuery((q) => q.from({ s: wealthSourcesCollection }))
  const { data: snapshots } = useLiveQuery((q) => q.from({ b: balanceSnapshotsCollection }))
  const { data: entries } = useLiveQuery((q) => q.from({ e: balanceEntriesCollection }))

  const sources = useMemo(() => visibleSources(allSources, entries), [allSources, entries])
  const readings = useMemo(
    () => buildReadings(snapshots, entries, allSources),
    [snapshots, entries, allSources],
  )

  const sourcesWithHistory = useMemo(
    () => new Set(entries.map((e) => e.wealth_source_id)),
    [entries],
  )

  const orderedSources = useMemo(
    () => allSources.slice().sort((a, b) => a.sort_order - b.sort_order),
    [allSources],
  )

  const headline = latestComplete(readings)

  const handleDeleteReading = async (snapshotId: string) => {
    try {
      await deleteBalanceSnapshot({ data: { id: snapshotId } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete reading')
    }
  }

  const handleDownloadCsv = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = [
      ['Date', 'Reading', ...sources.map((s) => s.name), 'Total'],
      ...readings.map((reading) => [
        escape(formatDate(reading.snapshot.date)),
        escape(reading.snapshot.label ?? ''),
        ...sources.map((s) => {
          const cents = reading.amounts.get(s.id)
          return cents == null ? '' : (cents / 100).toFixed(2)
        }),
        (reading.total / 100).toFixed(2),
      ]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'net-worth.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Balances</h1>
          {headline ? (
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-xl font-medium text-gray-900">
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
              <span className="text-xs text-gray-400">
                {formatDate(headline.snapshot.date)} ·{' '}
                {describeAge(daysSince(headline.snapshot.date, new Date()))}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              No complete readings yet — add one and fill in every source.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowSources((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Settings2 size={16} />
            Sources
          </button>
          <button
            onClick={handleDownloadCsv}
            disabled={readings.length === 0}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            title="Download as CSV"
          >
            <Download size={16} />
            CSV
          </button>
          <button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
            disabled={sources.length === 0}
            title={sources.length === 0 ? 'Add a source first' : 'Record balances for today'}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} />
            Add reading
          </button>
        </div>
      </div>

      {showSources && (
        <WealthSourcesPanel sources={orderedSources} sourcesWithHistory={sourcesWithHistory} />
      )}

      {sources.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-gray-500">
            No sources yet. Add your accounts under Sources, then record a reading.
          </p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-gray-200 bg-white"
          data-editable-table
        >
          {/* Years of readings would otherwise push the page metres long — the
              table keeps its own scroll and the header stays put above it. */}
          <div
            ref={scrollRef}
            className="overflow-auto"
            style={{ maxHeight: 'calc(100vh - 15rem)' }}
          >
            {/* Fixed layout: an input's intrinsic width is far wider than the
                formatted amount it replaces, so auto layout made every column
                jump the moment a cell opened for editing. */}
            <table className="w-full min-w-[560px] table-fixed text-sm">
              <thead>
                <tr className="text-xs font-medium uppercase tracking-wider text-gray-500 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-gray-50 [&>th]:shadow-[inset_0_-1px_0_var(--color-gray-200)]">
                  <th className="w-[120px] px-3 py-2 text-left font-medium">Date</th>
                  <th className="w-[160px] px-3 py-2 text-left font-medium">Reading</th>
                  {sources.map((source) => (
                    <th key={source.id} className="truncate px-3 py-2 text-right font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: source.color }}
                        />
                        {source.name}
                      </span>
                    </th>
                  ))}
                  <th className="w-[140px] px-3 py-2 text-right font-medium">Total</th>
                  <th className="w-[72px]" />
                </tr>
              </thead>
              <tbody>
                {readings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={sources.length + 4}
                      className="px-4 py-8 text-center text-sm text-gray-400"
                    >
                      No readings yet. Add your first one.
                    </td>
                  </tr>
                ) : (
                  readings.map((reading, readingIndex) => {
                    // Years of sweeps run together otherwise. Same divider the
                    // expense list puts between months.
                    const year = reading.snapshot.date.slice(0, 4)
                    const startsYear =
                      readingIndex > 0 &&
                      readings[readingIndex - 1].snapshot.date.slice(0, 4) !== year
                    const open = () => {
                      setEditing(reading)
                      setDialogOpen(true)
                    }
                    return (
                      <Fragment key={reading.snapshot.id}>
                        {startsYear && (
                          <tr data-year-divider={year}>
                            <td
                              colSpan={sources.length + 4}
                              className="border-y border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                            >
                              {year}
                            </td>
                          </tr>
                        )}
                        <tr
                          data-reading-id={reading.snapshot.id}
                          onClick={open}
                          className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="px-3 py-2 whitespace-nowrap">
                            {formatDate(reading.snapshot.date)}
                          </td>
                          <td className="truncate px-3 py-2">
                            {reading.snapshot.label || (
                              <span className="text-gray-400">Unnamed</span>
                            )}
                          </td>
                          {sources.map((source) => {
                            const cents = reading.amounts.get(source.id)
                            return (
                              <td
                                key={source.id}
                                className="px-3 py-2 text-right tabular-nums whitespace-nowrap"
                              >
                                {cents == null ? (
                                  <span className="text-gray-300">—</span>
                                ) : (
                                  formatCents(cents)
                                )}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="font-medium tabular-nums text-gray-900">
                              {formatCents(reading.total)}
                            </div>
                            {reading.complete
                              ? reading.delta !== null && (
                                  <div
                                    className={`text-xs tabular-nums ${
                                      reading.delta >= 0 ? 'text-green-600' : 'text-red-600'
                                    }`}
                                  >
                                    {reading.delta >= 0 ? '+' : '\u2212'}
                                    {formatCents(Math.abs(reading.delta))}
                                  </div>
                                )
                              : // An empty row has nothing to be missing yet — only
                                // flag a sweep that skipped something already tracked
                                reading.expected > 0 && (
                                  <div
                                    className="text-xs text-amber-600"
                                    title="Some sources tracked by this date have no value here"
                                  >
                                    {reading.filled} of {reading.expected}
                                  </div>
                                )}
                          </td>
                          <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                onClick={open}
                                title="Edit this reading"
                                aria-label="Edit this reading"
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              >
                                <Pencil size={13} />
                              </button>
                              <ConfirmButton
                                onConfirm={() => handleDeleteReading(reading.snapshot.id)}
                                title="Delete this reading?"
                                description={
                                  <>
                                    The sweep from{' '}
                                    <span className="font-medium text-gray-900">
                                      {formatDate(reading.snapshot.date)}
                                    </span>{' '}
                                    and all {reading.filled} of its balances will be removed.
                                  </>
                                }
                                confirmLabel="Delete reading"
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                              >
                                <Trash2 size={13} />
                              </ConfirmButton>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ReadingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sources={sources}
        readings={readings}
        reading={editing}
        onSaved={() => {
          // A new reading lands at the top, which may be scrolled away.
          if (!editing) scrollRef.current?.scrollTo({ top: 0 })
        }}
      />

      {sources.length > 0 && readings.length > 0 && (
        <p className="text-xs text-gray-400">
          Each row is one sweep through your accounts — click it to correct anything. Blank cells
          are left out of the total.
        </p>
      )}
    </div>
  )
}
