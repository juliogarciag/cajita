const STORAGE_KEY = 'cajita:apple_music'
const MAX_TOKEN_AGE_MS = 180 * 24 * 60 * 60 * 1000 // 180 days

interface StoredToken {
  userToken: string
  storedAt: number
}

export function getStoredUserToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: StoredToken = JSON.parse(raw)
    if (Date.now() - data.storedAt > MAX_TOKEN_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return data.userToken
  } catch {
    return null
  }
}

function storeUserToken(userToken: string): void {
  const data: StoredToken = { userToken, storedAt: Date.now() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function clearUserToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}

let musicKitInstance: MusicKit.MusicKitInstance | null = null

export async function configureMusicKit(developerToken: string): Promise<MusicKit.MusicKitInstance> {
  if (musicKitInstance) return musicKitInstance

  musicKitInstance = await MusicKit.configure({
    developerToken,
    app: {
      name: 'Cajita',
      build: '1.0.0',
    },
  })

  return musicKitInstance
}

export async function authorizeAppleMusic(developerToken: string): Promise<string> {
  const existingToken = getStoredUserToken()
  if (existingToken) return existingToken

  const instance = await configureMusicKit(developerToken)
  const userToken = await instance.authorize()
  storeUserToken(userToken)
  return userToken
}

export function isMusicKitLoaded(): boolean {
  return typeof MusicKit !== 'undefined'
}

export function loadMusicKitScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isMusicKitLoaded()) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load MusicKit JS'))
    document.head.appendChild(script)
  })
}
