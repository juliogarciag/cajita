import { useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Plus, Download, Trash2, Settings2, Lock, LockOpen, Snowflake } from 'lucide-react'
import { toast } from 'sonner'
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
import { formatCents, parseDollarsTocents, toISODate } from '#/lib/format.js'
import { useDateFormat } from '#/lib/date-format.js'
import {
  createBalanceSnapshot,
  updateBalanceSnapshot,
  deleteBalanceSnapshot,
  setBalanceEntry,
  setBalanceSnapshotLocked,
  freezePreviousReadings,
} from '#/server/balance-snapshots.js'
import { EditableCell } from './EditableCell.js'
import { ConfirmButton } from './ConfirmButton.js'
import { WealthSourcesPanel } from './WealthSourcesPanel.js'

export function NetWorthTable() {
  const { formatDate } = useDateFormat()
  const [showSources, setShowSources] = useState(false)
  const [newSnapshotId, setNewSnapshotId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

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

  // Readings older than the newest that are still editable — the bulk freeze
  // only has something to do while at least one exists.
  const unfrozenPrevious = readings.slice(1).filter((r) => !r.snapshot.locked).length

  const handleAddReading = async () => {
    setIsAdding(true)
    try {
      const result = await createBalanceSnapshot({ data: { date: toISODate(new Date()) } })
      setNewSnapshotId(result.snapshot.id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add reading')
    } finally {
      setIsAdding(false)
    }
  }

  const handleSetAmount = async (snapshotId: string, sourceId: string, raw: string) => {
    const trimmed = raw.trim()
    const cents = trimmed === '' ? null : parseDollarsTocents(trimmed)
    if (trimmed !== '' && cents === null) return
    try {
      await setBalanceEntry({
        data: {
          balance_snapshot_id: snapshotId,
          wealth_source_id: sourceId,
          amount_usd_cents: cents,
        },
      })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save balance')
    }
  }

  const handleSetDate = async (snapshotId: string, date: string) => {
    if (!date) return
    try {
      await updateBalanceSnapshot({ data: { id: snapshotId, date } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update date')
    }
  }

  const handleDeleteReading = async (snapshotId: string) => {
    try {
      await deleteBalanceSnapshot({ data: { id: snapshotId } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete reading')
    }
  }

  const handleSetLocked = async (snapshotId: string, locked: boolean) => {
    try {
      await setBalanceSnapshotLocked({ data: { id: snapshotId, locked } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to change the lock')
    }
  }

  const handleFreezePrevious = async () => {
    try {
      const { frozen } = await freezePreviousReadings()
      toast.success(
        frozen === 0
          ? 'Nothing to freeze — everything older is already frozen.'
          : `Froze ${frozen} ${frozen === 1 ? 'reading' : 'readings'}.`,
      )
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to freeze readings')
    }
  }

  const handleDownloadCsv = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = [
      ['Date', ...sources.map((s) => s.name), 'Total'],
      ...readings.map((reading) => [
        escape(formatDate(reading.snapshot.date)),
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
          <h1 className="text-2xl font-bold">Net worth</h1>
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
          {unfrozenPrevious > 0 && (
            <button
              onClick={handleFreezePrevious}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              title="Freeze every reading except the newest"
            >
              <Snowflake size={16} />
              Freeze previous
            </button>
          )}
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
            onClick={handleAddReading}
            disabled={isAdding || sources.length === 0}
            title={sources.length === 0 ? 'Add a source first' : 'Record balances for today'}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} />
            {isAdding ? 'Adding…' : 'Add reading'}
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
          className="overflow-x-auto rounded-lg border border-gray-200 bg-white"
          data-editable-table
        >
          {/* Fixed layout: an input's intrinsic width is far wider than the
              formatted amount it replaces, so auto layout made every column
              jump the moment a cell opened for editing. */}
          <table className="w-full min-w-[560px] table-fixed text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="w-[130px] px-3 py-2 text-left font-medium">Date</th>
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
                    colSpan={sources.length + 3}
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    No readings yet. Add your first one.
                  </td>
                </tr>
              ) : (
                readings.map((reading) => {
                  const isNew = reading.snapshot.id === newSnapshotId
                  const locked = reading.snapshot.locked
                  return (
                    <tr
                      key={reading.snapshot.id}
                      data-reading-id={reading.snapshot.id}
                      data-locked={locked ? 'true' : undefined}
                      className={`border-b border-gray-100 ${
                        locked ? 'bg-indigo-50/40' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-1">
                          {locked && (
                            <Lock size={11} className="shrink-0 text-indigo-400" aria-hidden />
                          )}
                          <EditableCell
                            value={reading.snapshot.date}
                            type="date"
                            disabled={locked}
                            onSave={(v) => handleSetDate(reading.snapshot.id, v)}
                          />
                        </div>
                      </td>
                      {sources.map((source, index) => {
                        const cents = reading.amounts.get(source.id)
                        return (
                          <td key={source.id} className="px-1 py-1">
                            <EditableCell
                              value={cents == null ? '' : formatCents(cents)}
                              type="amount"
                              className="text-right"
                              disabled={locked}
                              autoEdit={isNew && index === 0}
                              onSave={(v) => handleSetAmount(reading.snapshot.id, source.id, v)}
                            />
                          </td>
                        )
                      })}
                      <td className="px-3 py-1 text-right">
                        <div className="font-medium text-gray-900">
                          {formatCents(reading.total)}
                        </div>
                        {reading.complete
                          ? reading.delta !== null && (
                              <div
                                className={`text-xs ${
                                  reading.delta >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {reading.delta >= 0 ? '+' : '−'}
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
                      <td className="px-1 py-1">
                        <div className="flex items-center justify-end gap-0.5">
                          {locked ? (
                            // Unfreezing is the deliberate step — deletion only
                            // becomes possible once it's done
                            <ConfirmButton
                              onConfirm={() => handleSetLocked(reading.snapshot.id, false)}
                              tabIndex={-1}
                              title="Unfreeze this reading"
                              description={
                                <>
                                  The reading from{' '}
                                  <span className="font-medium text-gray-900">
                                    {formatDate(reading.snapshot.date)}
                                  </span>{' '}
                                  becomes editable again, and can be deleted.
                                </>
                              }
                              confirmLabel="Unfreeze"
                              tone="neutral"
                              className="rounded p-1 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
                            >
                              <LockOpen size={13} />
                            </ConfirmButton>
                          ) : (
                            <>
                              <button
                                onClick={() => handleSetLocked(reading.snapshot.id, true)}
                                tabIndex={-1}
                                title="Freeze this reading"
                                aria-label="Freeze this reading"
                                className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-indigo-600"
                              >
                                <Lock size={13} />
                              </button>
                              <ConfirmButton
                                onConfirm={() => handleDeleteReading(reading.snapshot.id)}
                                tabIndex={-1}
                                title="Delete this reading?"
                                description={
                                  <>
                                    The sweep from{' '}
                                    <span className="font-medium text-gray-900">
                                      {formatDate(reading.snapshot.date)}
                                    </span>{' '}
                                    and all {reading.filled} of its balances will be removed. Freeze
                                    it instead to keep it safe.
                                  </>
                                }
                                confirmLabel="Delete reading"
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                              >
                                <Trash2 size={13} />
                              </ConfirmButton>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {sources.length > 0 && readings.length > 0 && (
        <p className="text-xs text-gray-400">
          Each row is one sweep through your accounts — tab across to fill it in. Blank cells are
          left out of the total.
        </p>
      )}
    </div>
  )
}
