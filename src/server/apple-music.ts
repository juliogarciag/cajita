import { SignJWT, importPKCS8 } from 'jose'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from './middleware.js'

let cachedToken: { token: string; expiresAt: number } | null = null

async function generateDeveloperToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token
  }

  const teamId = process.env.APPLE_TEAM_ID
  const keyId = process.env.APPLE_KEY_ID
  const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY

  if (!teamId || !keyId || !privateKey) {
    throw new Error('Missing Apple Music environment variables')
  }

  const key = await importPKCS8(privateKey, 'ES256')
  const expiresAt = now + 6 * 60 * 60 // 6 hours

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(key)

  cachedToken = { token, expiresAt }
  return token
}

export const getDeveloperToken = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    const token = await generateDeveloperToken()
    return { token }
  })

export { generateDeveloperToken }
