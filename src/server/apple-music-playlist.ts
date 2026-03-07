import { createServerFn } from '@tanstack/react-start'
import { generateDeveloperToken } from './apple-music.js'
import { authMiddleware } from './middleware.js'

interface CreatePlaylistParams {
  name: string
  description?: string
  trackIds: string[]
  userToken: string
}

async function createAppleMusicPlaylist(params: CreatePlaylistParams): Promise<{ id: string }> {
  const developerToken = await generateDeveloperToken()
  const { name, description, trackIds, userToken } = params

  const body = {
    attributes: {
      name,
      description: description ?? '',
    },
    relationships: {
      tracks: {
        data: trackIds.map((id) => ({
          id,
          type: 'songs',
        })),
      },
    },
  }

  const res = await fetch('https://api.music.apple.com/v1/me/library/playlists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${developerToken}`,
      'Music-User-Token': userToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text()
    console.error(`Apple Music playlist creation failed: ${res.status}`, errorText)
    throw new Error(`Failed to create playlist: ${res.status}`)
  }

  const data = await res.json()
  const playlistId = data?.data?.[0]?.id ?? 'unknown'
  return { id: playlistId }
}

// --- Server Function ---

export const savePlaylist = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(
    async ({
      data,
    }: {
      data: {
        name: string
        description?: string
        trackIds: string[]
        userToken: string
      }
    }) => {
      if (!data.trackIds.length) {
        throw new Error('At least one track is required')
      }
      if (!data.userToken) {
        throw new Error('Apple Music user token is required')
      }
      const result = await createAppleMusicPlaylist(data)
      return result
    },
  )
