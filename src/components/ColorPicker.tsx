import { useState, useEffect } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { Bookmark, X } from 'lucide-react'
import { toast } from 'sonner'
import { colorBookmarksCollection, type ColorBookmark } from '#/lib/color-bookmarks-collection.js'
import { addColorBookmark, deleteColorBookmark } from '#/server/color-bookmarks.js'

const HEX = /^#[0-9a-fA-F]{6}$/

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

/**
 * Any color can be picked; the ones worth keeping are bookmarked per team, so
 * both of us see the same palette. Removing a bookmark never repaints a
 * category — categories store their own color.
 */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  // Local draft so dragging the native picker previews without committing —
  // onChange there fires continuously, and each commit is a server write.
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  const { data: bookmarks } = useLiveQuery((q) =>
    q.from({ b: colorBookmarksCollection }).orderBy(({ b }) => b.sort_order, 'asc'),
  )

  const normalized = value.toLowerCase()
  const isBookmarked = bookmarks.some((b) => b.color.toLowerCase() === normalized)
  const draftIsValid = HEX.test(draft)

  // Always read the live field value rather than the draft state: a keydown
  // fires before React re-renders, so the closed-over state can lag a keystroke.
  const commit = (raw: string) => {
    const next = raw.startsWith('#') ? raw : `#${raw}`
    if (HEX.test(next)) onChange(next.toLowerCase())
    else setDraft(value)
  }

  const handleSave = async () => {
    try {
      await addColorBookmark({ data: { color: normalized } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save color')
    }
  }

  const handleRemove = async (bookmark: ColorBookmark) => {
    try {
      await deleteColorBookmark({ data: { id: bookmark.id } })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove color')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {bookmarks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {bookmarks.map((bookmark: ColorBookmark) => {
            const selected = bookmark.color.toLowerCase() === normalized
            return (
              <span key={bookmark.id} className="group relative inline-flex">
                <button
                  type="button"
                  title={bookmark.color}
                  aria-label={`Use color ${bookmark.color}`}
                  onClick={() => onChange(bookmark.color)}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${
                    selected ? 'scale-110 border-gray-900' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: bookmark.color }}
                />
                <button
                  type="button"
                  title={`Remove ${bookmark.color} from saved colors`}
                  aria-label={`Remove color ${bookmark.color}`}
                  onClick={() => handleRemove(bookmark)}
                  className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-gray-700 text-white group-hover:flex hover:bg-red-600"
                >
                  <X size={8} strokeWidth={3} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX.test(draft) ? draft : '#000000'}
          onChange={(e) => setDraft(e.target.value.toLowerCase())}
          onBlur={(e) => commit(e.target.value)}
          aria-label="Pick a color"
          title="Pick any color"
          className="h-7 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(e.currentTarget.value.trim())
            }
            if (e.key === 'Escape') setDraft(value)
          }}
          spellCheck={false}
          aria-label="Hex color"
          placeholder="#22c55e"
          className={`w-24 rounded border px-2 py-1 font-mono text-xs ${
            draftIsValid ? 'border-gray-300' : 'border-red-400 text-red-600'
          }`}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isBookmarked || !HEX.test(value)}
          title={isBookmarked ? 'Already saved' : 'Save this color for reuse'}
          className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Bookmark size={12} />
          {isBookmarked ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}
