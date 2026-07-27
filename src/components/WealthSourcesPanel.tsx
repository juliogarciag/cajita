import { useState } from 'react'
import { Plus, Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { WealthSource } from '#/lib/wealth-sources-collection.js'
import {
  createWealthSource,
  updateWealthSource,
  deleteWealthSource,
} from '#/server/wealth-sources.js'
import { DEFAULT_CATEGORY_COLOR } from '#/lib/category-colors.js'
import { ColorPicker } from './ColorPicker.js'
import { ConfirmButton } from './ConfirmButton.js'

interface WealthSourcesPanelProps {
  sources: WealthSource[]
  /** Source ids that already have recorded balances — those can't be deleted. */
  sourcesWithHistory: Set<string>
}

export function WealthSourcesPanel({ sources, sourcesWithHistory }: WealthSourcesPanelProps) {
  const [addingName, setAddingName] = useState('')
  const [addingColor, setAddingColor] = useState(DEFAULT_CATEGORY_COLOR)
  const [showAdd, setShowAdd] = useState(false)
  const [colorOpenId, setColorOpenId] = useState<string | null>(null)

  const handleAdd = async () => {
    const name = addingName.trim()
    if (!name) return
    try {
      await createWealthSource({ data: { name, color: addingColor } })
      setAddingName('')
      setAddingColor(DEFAULT_CATEGORY_COLOR)
      setShowAdd(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add source')
    }
  }

  const handleUpdate = async (id: string, updates: Partial<WealthSource>) => {
    try {
      await updateWealthSource({ data: { id, ...updates } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update source')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteWealthSource({ data: { id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete source')
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Sources</h3>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <Plus size={13} />
          Add source
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-end gap-2">
            <input
              type="text"
              placeholder="Bank account"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') setShowAdd(false)
              }}
              autoFocus
              className="w-56 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleAdd}
              disabled={!addingName.trim()}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
          <ColorPicker value={addingColor} onChange={setAddingColor} />
        </div>
      )}

      {sources.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">
          No sources yet. Add your bank account to start.
        </p>
      ) : (
        <div className="flex flex-col">
          {sources.map((source) => (
            <div key={source.id} className="flex flex-col gap-2 border-t border-gray-100 py-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Change color"
                  aria-label={`Change color of ${source.name}`}
                  onClick={() => setColorOpenId(colorOpenId === source.id ? null : source.id)}
                  className="h-3.5 w-3.5 shrink-0 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: source.color }}
                />
                <input
                  type="text"
                  defaultValue={source.name}
                  aria-label={`Name of ${source.name}`}
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    if (name && name !== source.name) handleUpdate(source.id, { name })
                    else e.target.value = source.name
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                  className={`flex-1 rounded border border-transparent px-2 py-1 text-sm hover:border-gray-200 focus:border-gray-300 focus:outline-none ${
                    source.archived ? 'text-gray-400 line-through' : ''
                  }`}
                />
                <button
                  onClick={() => handleUpdate(source.id, { archived: !source.archived })}
                  title={
                    source.archived
                      ? 'Bring back into new readings'
                      : 'Archive — keeps history, drops out of new readings'
                  }
                  aria-label={
                    source.archived ? `Unarchive ${source.name}` : `Archive ${source.name}`
                  }
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  {source.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                </button>
                {sourcesWithHistory.has(source.id) ? (
                  <span
                    title="Has recorded balances — archive it instead"
                    aria-label="Cannot delete a source with balances"
                    className="cursor-not-allowed p-1 text-gray-200"
                  >
                    <Trash2 size={13} />
                  </span>
                ) : (
                  <ConfirmButton
                    onConfirm={() => handleDelete(source.id)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  >
                    <Trash2 size={13} />
                  </ConfirmButton>
                )}
              </div>
              {colorOpenId === source.id && (
                <div className="pl-6">
                  <ColorPicker
                    value={source.color}
                    onChange={(color) => handleUpdate(source.id, { color })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
