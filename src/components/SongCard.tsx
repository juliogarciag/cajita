import { RefreshCw, Trash2, AlertCircle } from 'lucide-react'
import type { CatalogSong } from '#/server/apple-music-catalog.js'

interface SongCardProps {
  song: CatalogSong
  index: number
  isReloading: boolean
  onReload: () => void
  onDelete: () => void
}

export function SongCard({ song, index, isReloading, onReload, onDelete }: SongCardProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        song.status === 'not_found' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'
      } ${isReloading ? 'opacity-50' : ''}`}
    >
      <span className="w-6 text-right text-xs text-gray-400">{index + 1}</span>

      {song.artworkUrl ? (
        <img src={song.artworkUrl} alt={`${song.title} artwork`} className="h-10 w-10 rounded" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-100">
          {song.status === 'not_found' ? (
            <AlertCircle size={16} className="text-amber-500" />
          ) : (
            <div className="h-4 w-4 rounded-full bg-gray-300" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{song.title}</p>
        <p className="truncate text-xs text-gray-500">{song.artist}</p>
      </div>

      {song.status === 'not_found' && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Not found</span>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onReload}
          disabled={isReloading}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          title="Replace with a different song"
        >
          <RefreshCw size={14} className={isReloading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isReloading}
          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
          title="Remove song"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
