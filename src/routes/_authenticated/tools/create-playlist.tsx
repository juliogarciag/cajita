import { useState, useCallback, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Music, Check, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { SongCard } from '#/components/SongCard.js'
import { getDeveloperToken } from '#/server/apple-music.js'
import { generatePlaylistSongs, reloadSong } from '#/server/playlist-generator.js'
import { resolveSongs, resolveSingleSong } from '#/server/apple-music-catalog.js'
import { savePlaylist } from '#/server/apple-music-playlist.js'
import {
  loadMusicKitScript,
  authorizeAppleMusic,
  getStoredUserToken,
  clearUserToken,
} from '#/lib/apple-music-auth.js'
import type { CatalogSong } from '#/server/apple-music-catalog.js'

export const Route = createFileRoute('/_authenticated/tools/create-playlist')({
  component: CreatePlaylistPage,
})

type Phase = 'input' | 'authenticating' | 'generating' | 'searching' | 'review' | 'saving' | 'done'

const SONGS_PER_PAGE = 10

function CreatePlaylistPage() {
  const [prompt, setPrompt] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [songs, setSongs] = useState<CatalogSong[]>([])
  const [playlistName, setPlaylistName] = useState('')
  const [playlistDescription, setPlaylistDescription] = useState('')
  const [reloadingIndex, setReloadingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userToken, setUserToken] = useState<string | null>(getStoredUserToken)
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const totalPages = Math.max(1, Math.ceil(songs.length / SONGS_PER_PAGE))
  const paginatedSongs = songs.slice(
    currentPage * SONGS_PER_PAGE,
    (currentPage + 1) * SONGS_PER_PAGE,
  )

  const handleCreate = useCallback(async () => {
    if (!prompt.trim()) return
    setError(null)

    try {
      // Step 1: Ensure Apple Music auth
      setPhase('authenticating')
      let token = userToken

      if (!token) {
        await loadMusicKitScript()
        const { token: devToken } = await getDeveloperToken()
        token = await authorizeAppleMusic(devToken)
        setUserToken(token)
      }

      // Step 2: Generate songs with Claude
      setPhase('generating')
      const {
        songs: generatedSongs,
        suggestedName,
        suggestedDescription,
      } = await generatePlaylistSongs({ data: { prompt, count: 50 } })

      setPlaylistName(suggestedName)
      setPlaylistDescription(suggestedDescription)

      // Step 3: Search Apple Music catalog
      setPhase('searching')
      const { songs: resolvedSongs } = await resolveSongs({ data: { songs: generatedSongs } })

      setSongs(resolvedSongs)
      setPhase('review')
    } catch (err) {
      console.error('Error creating playlist:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setPhase('input')
    }
  }, [prompt, userToken])

  const handleReload = useCallback(
    async (index: number) => {
      const song = songs[index]
      if (!song || reloadingIndex !== null) return

      setReloadingIndex(index)
      try {
        const currentSongs = songs.map((s) => ({ artist: s.artist, title: s.title }))
        const { song: newSong } = await reloadSong({
          data: {
            prompt,
            currentSongs,
            rejectedSong: { artist: song.artist, title: song.title },
          },
        })

        // Resolve the new song in Apple Music
        const { song: resolved } = await resolveSingleSong({
          data: { artist: newSong.artist, title: newSong.title },
        })

        setSongs((prev) => {
          const updated = [...prev]
          updated[index] = resolved
          return updated
        })
      } catch (err) {
        console.error('Error reloading song:', err)
      } finally {
        setReloadingIndex(null)
      }
    },
    [songs, reloadingIndex, prompt],
  )

  const handleDelete = useCallback(
    (index: number) => {
      setSongs((prev) => {
        const updated = prev.filter((_, i) => i !== index)
        // If current page would be out of bounds after deletion, go to last page
        const newTotalPages = Math.max(1, Math.ceil(updated.length / SONGS_PER_PAGE))
        if (currentPage >= newTotalPages) {
          setCurrentPage(Math.max(0, newTotalPages - 1))
        }
        return updated
      })
    },
    [currentPage],
  )

  const handleSave = useCallback(async () => {
    const trackIds = songs.filter((s) => s.appleMusicId).map((s) => s.appleMusicId!)
    if (trackIds.length === 0) return

    const token = userToken
    if (!token) {
      setError('Apple Music authorization required. Please reconnect.')
      return
    }

    setPhase('saving')
    setError(null)

    try {
      await savePlaylist({
        data: {
          name: playlistName || 'Cajita Playlist',
          description: playlistDescription,
          trackIds,
          userToken: token,
        },
      })
      setPhase('done')
    } catch (err) {
      console.error('Error saving playlist:', err)
      // If it's likely a token issue, clear and let them re-auth
      if (err instanceof Error && err.message.includes('401')) {
        clearUserToken()
        setUserToken(null)
        setError('Apple Music session expired. Please try again to re-authenticate.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save playlist')
      }
      setPhase('review')
    }
  }, [songs, playlistName, playlistDescription, userToken])

  const handleReset = useCallback(() => {
    audioRef.current?.pause()
    setPlayingIndex(null)
    setCurrentPage(0)
    setPrompt('')
    setSongs([])
    setPlaylistName('')
    setPlaylistDescription('')
    setPhase('input')
    setError(null)
  }, [])

  const handleTogglePreview = useCallback(
    (index: number) => {
      const song = songs[index]
      if (!song?.previewUrl) return

      // Create audio element on first use
      if (!audioRef.current) {
        audioRef.current = new Audio()
        audioRef.current.addEventListener('ended', () => setPlayingIndex(null))
      }

      const audio = audioRef.current

      if (playingIndex === index) {
        // Pause current song
        audio.pause()
        setPlayingIndex(null)
      } else {
        // Play new song (stops previous automatically)
        audio.src = song.previewUrl
        audio.play()
        setPlayingIndex(index)
      }
    },
    [songs, playingIndex],
  )

  // Stop preview when leaving review phase or deleting the playing song
  const handleDeleteWithStop = useCallback(
    (index: number) => {
      if (playingIndex === index) {
        audioRef.current?.pause()
        setPlayingIndex(null)
      } else if (playingIndex !== null && index < playingIndex) {
        // Adjust index if a song before the playing one is removed
        setPlayingIndex(playingIndex - 1)
      }
      handleDelete(index)
    },
    [handleDelete, playingIndex],
  )

  const handlePageChange = useCallback(
    (page: number) => {
      // Stop audio if the currently playing song won't be on the new page
      if (playingIndex !== null) {
        const newStart = page * SONGS_PER_PAGE
        const newEnd = (page + 1) * SONGS_PER_PAGE
        if (playingIndex < newStart || playingIndex >= newEnd) {
          audioRef.current?.pause()
          setPlayingIndex(null)
        }
      }
      setCurrentPage(page)
    },
    [playingIndex],
  )

  const matchedCount = songs.filter((s) => s.status === 'matched').length

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Create Playlist</h1>
      <p className="mt-1 text-sm text-gray-500">
        Describe the playlist you want and AI will generate it for your Apple Music library.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Input Phase */}
      {phase === 'input' && (
        <div className="mt-6">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Chill lo-fi beats for studying, 90s alternative rock anthems, Happy songs for a road trip..."
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            rows={4}
            maxLength={500}
          />
          <div className="mt-1 text-right text-xs text-gray-400">{prompt.length}/500</div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!prompt.trim()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles size={16} />
            Create Music Playlist
          </button>
        </div>
      )}

      {/* Loading Phases */}
      {(phase === 'authenticating' || phase === 'generating' || phase === 'searching') && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">
            {phase === 'authenticating' && 'Connecting to Apple Music...'}
            {phase === 'generating' && 'AI is generating song recommendations...'}
            {phase === 'searching' && 'Searching Apple Music catalog...'}
          </p>
        </div>
      )}

      {/* Review Phase */}
      {phase === 'review' && (
        <div className="mt-6">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500">Playlist name</label>
            <input
              type="text"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Action buttons + song count — above the list */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {songs.length} songs ({matchedCount} found in Apple Music)
            </p>
          </div>

          <div className="mb-4 flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Start Over
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={matchedCount === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Music size={16} />
              Save to Apple Music ({matchedCount})
            </button>
          </div>

          {/* Paginated song list */}
          <div className="space-y-2">
            {paginatedSongs.map((song, localIndex) => {
              const absoluteIndex = currentPage * SONGS_PER_PAGE + localIndex
              return (
                <SongCard
                  key={`${song.artist}-${song.title}-${absoluteIndex}`}
                  song={song}
                  index={absoluteIndex}
                  isReloading={reloadingIndex === absoluteIndex}
                  isPlaying={playingIndex === absoluteIndex}
                  onReload={() => handleReload(absoluteIndex)}
                  onDelete={() => handleDeleteWithStop(absoluteIndex)}
                  onTogglePreview={() => handleTogglePreview(absoluteIndex)}
                />
              )
            })}
          </div>

          {songs.length === 0 && (
            <div className="mt-8 text-center text-sm text-gray-400">
              All songs removed. Go back to generate new ones.
            </div>
          )}

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 0}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-500">
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages - 1}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Saving Phase */}
      {phase === 'saving' && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Creating playlist in Apple Music...</p>
        </div>
      )}

      {/* Done Phase */}
      {phase === 'done' && (
        <div className="mt-12 flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-lg font-semibold">Playlist Created!</h2>
          <p className="text-sm text-gray-500">
            &ldquo;{playlistName}&rdquo; has been added to your Apple Music library with{' '}
            {matchedCount} songs.
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="mt-4 rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Create Another Playlist
          </button>
        </div>
      )}
    </div>
  )
}
