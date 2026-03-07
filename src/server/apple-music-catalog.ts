import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { generateDeveloperToken } from './apple-music.js'
import { authMiddleware } from './middleware.js'

const SEARCH_LIMIT = 5
const CONCURRENCY = 5

export interface CatalogSong {
  artist: string
  title: string
  appleMusicId: string | null
  artworkUrl: string | null
  previewUrl: string | null
  status: 'matched' | 'not_found'
}

const appleMusicSongSchema = z.object({
  id: z.string(),
  attributes: z.object({
    name: z.string(),
    artistName: z.string(),
    artwork: z
      .object({
        url: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
      })
      .optional(),
    previews: z
      .array(
        z.object({
          url: z.string(),
        }),
      )
      .optional(),
  }),
})

const searchResponseSchema = z.object({
  results: z.object({
    songs: z
      .object({
        data: z.array(appleMusicSongSchema),
      })
      .optional(),
  }),
})

function formatArtworkUrl(url: string, size: number = 200): string {
  return url.replace('{w}', String(size)).replace('{h}', String(size))
}

async function searchSong(
  artist: string,
  title: string,
  developerToken: string,
): Promise<CatalogSong> {
  const searchQuery = `${title} ${artist}`
  const url = new URL('https://api.music.apple.com/v1/catalog/us/search')
  url.searchParams.set('term', searchQuery)
  url.searchParams.set('types', 'songs')
  url.searchParams.set('limit', String(SEARCH_LIMIT))

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${developerToken}` },
    })

    if (!res.ok) {
      console.error(`Apple Music search failed: ${res.status} for "${searchQuery}"`)
      return {
        artist,
        title,
        appleMusicId: null,
        artworkUrl: null,
        previewUrl: null,
        status: 'not_found',
      }
    }

    const data = searchResponseSchema.parse(await res.json())
    const songs = data.results.songs?.data

    if (!songs || songs.length === 0) {
      // Fallback: search with just the title
      const fallbackUrl = new URL('https://api.music.apple.com/v1/catalog/us/search')
      fallbackUrl.searchParams.set('term', title)
      fallbackUrl.searchParams.set('types', 'songs')
      fallbackUrl.searchParams.set('limit', String(SEARCH_LIMIT))

      const fallbackRes = await fetch(fallbackUrl.toString(), {
        headers: { Authorization: `Bearer ${developerToken}` },
      })

      if (!fallbackRes.ok) {
        return {
          artist,
          title,
          appleMusicId: null,
          artworkUrl: null,
          previewUrl: null,
          status: 'not_found',
        }
      }

      const fallbackData = searchResponseSchema.parse(await fallbackRes.json())
      const fallbackSongs = fallbackData.results.songs?.data

      if (!fallbackSongs || fallbackSongs.length === 0) {
        return {
          artist,
          title,
          appleMusicId: null,
          artworkUrl: null,
          previewUrl: null,
          status: 'not_found',
        }
      }

      const match = fallbackSongs[0]
      return {
        artist: match.attributes.artistName,
        title: match.attributes.name,
        appleMusicId: match.id,
        artworkUrl: match.attributes.artwork
          ? formatArtworkUrl(match.attributes.artwork.url)
          : null,
        previewUrl: match.attributes.previews?.[0]?.url ?? null,
        status: 'matched',
      }
    }

    const match = songs[0]
    return {
      artist: match.attributes.artistName,
      title: match.attributes.name,
      appleMusicId: match.id,
      artworkUrl: match.attributes.artwork ? formatArtworkUrl(match.attributes.artwork.url) : null,
      previewUrl: match.attributes.previews?.[0]?.url ?? null,
      status: 'matched',
    }
  } catch (error) {
    console.error(`Apple Music search error for "${searchQuery}":`, error)
    return {
      artist,
      title,
      appleMusicId: null,
      artworkUrl: null,
      previewUrl: null,
      status: 'not_found',
    }
  }
}

async function searchSongsWithConcurrency(
  songs: Array<{ artist: string; title: string }>,
  developerToken: string,
): Promise<CatalogSong[]> {
  const results: CatalogSong[] = new Array(songs.length)

  // Process in batches of CONCURRENCY
  for (let i = 0; i < songs.length; i += CONCURRENCY) {
    const batch = songs.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map((song) => searchSong(song.artist, song.title, developerToken)),
    )
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j]
    }
  }

  return results
}

// --- Server Functions ---

export const resolveSongs = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data }: { data: { songs: Array<{ artist: string; title: string }> } }) => {
    const developerToken = await generateDeveloperToken()
    const resolved = await searchSongsWithConcurrency(data.songs, developerToken)
    return { songs: resolved }
  })

export const resolveSingleSong = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data }: { data: { artist: string; title: string } }) => {
    const developerToken = await generateDeveloperToken()
    const result = await searchSong(data.artist, data.title, developerToken)
    return { song: result }
  })
