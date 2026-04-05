import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { ArrowLeft } from 'lucide-react'
import { movementsCollection, type Movement } from '#/lib/movements-collection.js'
import { formatCents } from '#/lib/format.js'
import { useDateFormat } from '#/lib/date-format.js'

interface SnapshotMovement {
  id: string
  description: string
  date: string
  amount_cents: number
  category_id: string | null
  sort_position: number
}

interface DiffResult {
  added: Movement[]
  removed: SnapshotMovement[]
  modified: Array<{
    current: Movement
    snapshot: SnapshotMovement
    changes: string[]
  }>
  unchanged: number
}

interface SnapshotDiffProps {
  snapshotData: unknown[]
  onConfirm: () => void
  onCancel: () => void
}

export function SnapshotDiff({ snapshotData, onConfirm, onCancel }: SnapshotDiffProps) {
  const { data: currentMovements } = useLiveQuery((q) =>
    q
      .from({ m: movementsCollection })
      .orderBy(({ m }) => m.date, 'asc')
      .orderBy(({ m }) => m.sort_position, 'asc'),
  )

  const snapshotMovements = snapshotData as SnapshotMovement[]

  const diff: DiffResult = useMemo(() => {
    const snapshotMap = new Map<string, SnapshotMovement>()
    for (const m of snapshotMovements) {
      snapshotMap.set(m.id, m)
    }

    const currentMap = new Map<string, Movement>()
    for (const m of currentMovements) {
      currentMap.set(m.id, m)
    }

    const added: Movement[] = []
    const modified: DiffResult['modified'] = []
    let unchanged = 0

    // Movements in current but not in snapshot = added since snapshot
    for (const m of currentMovements) {
      const snap = snapshotMap.get(m.id)
      if (!snap) {
        added.push(m)
      } else {
        const changes: string[] = []
        if (m.description !== snap.description) changes.push('description')
        if (m.date !== snap.date) changes.push('date')
        if (m.amount_cents !== snap.amount_cents) changes.push('amount')
        if (m.category_id !== snap.category_id) changes.push('category')

        if (changes.length > 0) {
          modified.push({ current: m, snapshot: snap, changes })
        } else {
          unchanged++
        }
      }
    }

    // Movements in snapshot but not in current = removed since snapshot
    const removed: SnapshotMovement[] = []
    for (const m of snapshotMovements) {
      if (!currentMap.has(m.id)) {
        removed.push(m)
      }
    }

    return { added, removed, modified, unchanged }
  }, [currentMovements, snapshotMovements])

  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <button onClick={onCancel} className="rounded p-1 hover:bg-gray-100">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold">Restore Preview</h2>
      </div>

      {/* Summary */}
      <div className="border-b border-gray-200 px-4 py-3">
        {!hasChanges ? (
          <p className="text-sm text-gray-500">
            No differences found. Current data matches this snapshot.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3 text-sm">
            {diff.added.length > 0 && (
              <span className="text-red-600">{diff.added.length} will be removed</span>
            )}
            {diff.removed.length > 0 && (
              <span className="text-green-600">{diff.removed.length} will be restored</span>
            )}
            {diff.modified.length > 0 && (
              <span className="text-amber-600">{diff.modified.length} will revert changes</span>
            )}
            {diff.unchanged > 0 && (
              <span className="text-gray-500">{diff.unchanged} unchanged</span>
            )}
          </div>
        )}
        <p className="mt-1 text-xs text-gray-400">
          Restoring creates a backup of current state first.
        </p>
      </div>

      {/* Diff details */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {diff.added.length > 0 && (
          <DiffSection title="Will be removed" color="red">
            {diff.added.map((m) => (
              <DiffRow
                key={m.id}
                description={m.description}
                date={m.date}
                amount={m.amount_cents}
              />
            ))}
          </DiffSection>
        )}

        {diff.removed.length > 0 && (
          <DiffSection title="Will be restored" color="green">
            {diff.removed.map((m) => (
              <DiffRow
                key={m.id}
                description={m.description}
                date={m.date}
                amount={m.amount_cents}
              />
            ))}
          </DiffSection>
        )}

        {diff.modified.length > 0 && (
          <DiffSection title="Will revert changes" color="amber">
            {diff.modified.map(({ current, snapshot, changes }) => (
              <ModifiedRow
                key={current.id}
                current={current}
                snapshot={snapshot}
                changes={changes}
              />
            ))}
          </DiffSection>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
        {hasChanges && (
          <button
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Confirm Restore
          </button>
        )}
      </div>
    </div>
  )
}

function DiffSection({
  title,
  color,
  children,
}: {
  title: string
  color: 'red' | 'green' | 'amber'
  children: React.ReactNode
}) {
  const colors = {
    red: 'border-red-200 bg-red-50',
    green: 'border-green-200 bg-green-50',
    amber: 'border-amber-200 bg-amber-50',
  }

  return (
    <div className={`mb-3 rounded-md border p-3 ${colors[color]}`}>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-600">{title}</h3>
      {children}
    </div>
  )
}

function ModifiedRow({
  current,
  snapshot,
  changes,
}: {
  current: Movement
  snapshot: SnapshotMovement
  changes: string[]
}) {
  const { formatDate } = useDateFormat()
  return (
    <div className="py-1.5 text-xs">
      <div className="font-medium text-gray-700">{current.description || snapshot.description}</div>
      <div className="mt-0.5 text-gray-500">
        {changes.map((field) => {
          const fieldKey = field === 'amount' ? 'amount_cents' : field
          const cur =
            field === 'amount'
              ? formatCents(current.amount_cents)
              : field === 'date'
                ? formatDate(current.date)
                : String((current as unknown as Record<string, unknown>)[fieldKey])
          const snap =
            field === 'amount'
              ? formatCents(snapshot.amount_cents)
              : field === 'date'
                ? formatDate(snapshot.date)
                : String((snapshot as unknown as Record<string, unknown>)[fieldKey])
          return (
            <span key={field} className="mr-2">
              {field}: <span className="line-through text-red-500">{cur}</span>{' '}
              <span className="text-green-600">{snap}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function DiffRow({
  description,
  date,
  amount,
}: {
  description: string
  date: string
  amount: number
}) {
  const { formatDate } = useDateFormat()
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-gray-700">{description || '(no description)'}</span>
      <div className="flex items-center gap-3">
        <span className="text-gray-500">{formatDate(date)}</span>
        <span className={amount > 0 ? 'text-green-700' : 'text-red-700'}>
          {formatCents(amount)}
        </span>
      </div>
    </div>
  )
}
