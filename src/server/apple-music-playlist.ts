import { createServerFn } from '@tanstack/react-start'
import { generateDeveloperToken } from './apple-music.js'
import { authMiddleware } from './middleware.js'

const FOLDER_NAME = 'cajita'

interface CreatePlaylistParams {
  name: string
  description?: string
  trackIds: string[]
  userToken: string
}

function authHeaders(developerToken: string, userToken: string) {
  return {
    Authorization: `Bearer ${developerToken}`,
    'Music-User-Token': userToken,
    'Content-Type': 'application/json',
  }
}

async function getOrCreateCajitaFolder(
  developerToken: string,
  userToken: string,
): Promise<string> {
  const headers = authHeaders(developerToken, userToken)

  // List existing top-level playlist folders
  const listRes = await fetch('https://api.music.apple.com/v1/me/library/playlist-folders', {
    headers,
  })

  if (listRes.ok) {
    const listData = await listRes.json()
    const existing = listData?.data?.find(
      (f: { attributes?: { name?: string } }) =>
        f.attributes?.name?.toLowerCase() === FOLDER_NAME,
    )
    if (existing) return existing.id
  }

  // Create the folder if it doesn't exist
  const createRes = await fetch('https://api.music.apple.com/v1/me/library/playlist-folders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ attributes: { name: FOLDER_NAME } }),
  })

  if (!createRes.ok) {
    const errorText = await createRes.text()
    console.error(`Failed to create "${FOLDER_NAME}" folder: ${createRes.status}`, errorText)
    throw new Error(`Failed to create playlist folder: ${createRes.status}`)
  }

  const createData = await createRes.json()
  return createData?.data?.[0]?.id
}

async function createAppleMusicPlaylist(params: CreatePlaylistParams): Promise<{ id: string }> {
  const developerToken = await generateDeveloperToken()
  const { name, description, trackIds, userToken } = params

  const folderId = await getOrCreateCajitaFolder(developerToken, userToken)

  const body = {
    attributes: {
      name,
      description: description ?? '',
    },
    relationships: {
      tracks: {
        data: trackIds.map((id) => ({
          id,
          type: 'songs' as const,
        })),
      },
      parent: {
        data: [{ id: folderId, type: 'library-playlist-folders' as const }],
      },
    },
  }

  const res = await fetch('https://api.music.apple.com/v1/me/library/playlists', {
    method: 'POST',
    headers: authHeaders(developerToken, userToken),
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
