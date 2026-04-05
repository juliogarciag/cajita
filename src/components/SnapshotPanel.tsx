import { useState, useCallback, useEffect, useMemo } from 'react'
import { Camera, Pin, Trash2, RotateCcw, X } from 'lucide-react'
import {
  getSnapshots,
  createSnapshot,
  pinSnapshot,
  deleteSnapshot,
  getSnapshotData,
  restoreSnapshot,
  ensureTodaySnapshot,
} from '#/server/snapshots.js'
import { SnapshotDiff } from './SnapshotDiff.js'
import { useDateFormat } from '#/lib/date-format.js'

interface Snapshot {
  id: string
  name: string | null
  type: 'automatic' | 'manual'
  pinned: boolean
  created_at: Date
}

interface SnapshotPanelProps {
  open: boolean
  onClose: () => void
}

export function SnapshotPanel({ open, onClose }: SnapshotPanelProps) {
  const { formatDate } = useDateFormat()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [diffSnapshotId, setDiffSnapshotId] = useState<string | null>(null)
  const [diffData, setDiffData] = useState<unknown[] | null>(null)

  const formatSnapshotTimestamp = useMemo(
    () => (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date
      const datePart = formatDate(d.toISOString().slice(0, 10))
      const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      return `${datePart}, ${timePart}`
    },
    [formatDate],
  )

  const loadSnapshots = useCallback(async () => {
    setLoading(true)
    const result = await getSnapshots()
    setSnapshots(result.snapshots as Snapshot[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) {
      loadSnapshots()
      // Ensure today's auto snapshot exists
      ensureTodaySnapshot().catch(() => {})
    }
  }, [open, loadSnapshots])

  const handleCreate = useCallback(async () => {
    setCreating(true)
    await createSnapshot({ data: { name: snapshotName || undefined, type: 'manual' } })
    setSnapshotName('')
    setCreating(false)
    loadSnapshots()
  }, [snapshotName, loadSnapshots])

  const handlePin = useCallback(
    async (id: string) => {
      await pinSnapshot({ data: { id } })
      loadSnapshots()
    },
    [loadSnapshots],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteSnapshot({ data: { id } })
      loadSnapshots()
    },
    [loadSnapshots],
  )

  const handleViewDiff = useCallback(async (id: string) => {
    const result = (await getSnapshotData({ data: { id } })) as { snapshot: { data: unknown } }
    const rawData = result.snapshot.data
    const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
    setDiffData(data as unknown[])
    setDiffSnapshotId(id)
  }, [])

  const handleRestore = useCallback(
    async (id: string) => {
      await restoreSnapshot({ data: { id } })
      setDiffSnapshotId(null)
      setDiffData(null)
      loadSnapshots()
    },
    [loadSnapshots],
  )

  if (!open) return null

  if (diffSnapshotId && diffData) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 w-[480px] border-l border-gray-200 bg-white shadow-lg">
        <SnapshotDiff
          snapshotData={diffData}
          onConfirm={() => handleRestore(diffSnapshotId)}
          onCancel={() => {
            setDiffSnapshotId(null)
            setDiffData(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[380px] border-l border-gray-200 bg-white shadow-lg">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold">Snapshots</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Create snapshot */}
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Snapshot name (optional)"
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1 rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Camera size={14} />
              Save
            </button>
          </div>
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">Loading...</div>
          ) : snapshots.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No snapshots yet. Create your first one.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {snapshots.map((snap) => (
                <li key={snap.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-900">
                          {snap.name || formatSnapshotTimestamp(snap.created_at)}
                        </span>
                        <TypeBadge type={snap.type} pinned={snap.pinned} />
                      </div>
                      {snap.name && (
                        <p className="text-xs text-gray-500">
                          {formatSnapshotTimestamp(snap.created_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {snap.type === 'automatic' && !snap.pinned && (
                        <button
                          onClick={() => handlePin(snap.id)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-amber-600"
                          title="Pin (keep forever)"
                        >
                          <Pin size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleViewDiff(snap.id)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                        title="Restore from this snapshot"
                      >
                        <RotateCcw size={14} />
                      </button>
                      {snap.type === 'automatic' && !snap.pinned && (
                        <button
                          onClick={() => handleDelete(snap.id)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function TypeBadge({ type, pinned }: { type: string; pinned: boolean }) {
  if (pinned) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
        <Pin size={9} /> Pinned
      </span>
    )
  }
  if (type === 'manual') {
    return (
      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
        Manual
      </span>
    )
  }
  return (
    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
      Auto
    </span>
  )
}
