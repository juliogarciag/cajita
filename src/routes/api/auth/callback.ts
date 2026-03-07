import { createFileRoute } from '@tanstack/react-router'
import { google } from '#/server/auth.js'
import { createSession, upsertUser } from '#/server/session.js'
import { isEmailAllowed } from '#/config/allowed-users.js'
import { parseCookies, serializeCookie, deleteCookieHeader } from '#/server/cookies.js'

export const Route = createFileRoute('/api/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        const cookies = parseCookies(request)
        const storedState = cookies['oauth_state']
        const storedCodeVerifier = cookies['oauth_code_verifier']

        if (!code || !state || state !== storedState || !storedCodeVerifier) {
          return new Response('Invalid OAuth callback', { status: 400 })
        }

        try {
          const tokens = await google.validateAuthorizationCode(code, storedCodeVerifier)
          const accessToken = tokens.accessToken()

          const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          if (!profileResponse.ok) {
            return new Response('Failed to fetch user profile', { status: 500 })
          }

          const profile = (await profileResponse.json()) as {
            email: string
            name: string
            picture: string
          }

          if (!isEmailAllowed(profile.email)) {
            return new Response('Access denied. Your email is not authorized.', { status: 403 })
          }

          const userId = await upsertUser({
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
          })

          const sessionToken = await createSession(userId)

          const headers = new Headers()
          headers.append('Set-Cookie', deleteCookieHeader('oauth_state'))
          headers.append('Set-Cookie', deleteCookieHeader('oauth_code_verifier'))
          headers.append(
            'Set-Cookie',
            serializeCookie('session', sessionToken, {
              secure: process.env.NODE_ENV === 'production',
              path: '/',
              httpOnly: true,
              maxAge: 7 * 24 * 60 * 60,
              sameSite: 'lax',
            }),
          )
          headers.set('Location', '/dashboard')

          return new Response(null, { status: 302, headers })
        } catch (error) {
          console.error('OAuth callback error:', error)
          return new Response('Authentication failed', { status: 500 })
        }
      },
    },
  },
})
