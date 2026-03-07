import { createFileRoute } from '@tanstack/react-router'
import * as arctic from 'arctic'
import { google } from '#/server/auth.js'
import { serializeCookie } from '#/server/cookies.js'

export const Route = createFileRoute('/api/auth/google')({
  server: {
    handlers: {
      GET: async () => {
        const state = arctic.generateState()
        const codeVerifier = arctic.generateCodeVerifier()
        const scopes = ['openid', 'email', 'profile']

        const url = google.createAuthorizationURL(state, codeVerifier, scopes)

        const cookieOptions = {
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          httpOnly: true,
          maxAge: 60 * 10,
          sameSite: 'lax' as const,
        }

        const headers = new Headers()
        headers.append('Set-Cookie', serializeCookie('oauth_state', state, cookieOptions))
        headers.append(
          'Set-Cookie',
          serializeCookie('oauth_code_verifier', codeVerifier, cookieOptions),
        )
        headers.set('Location', url.toString())

        return new Response(null, { status: 302, headers })
      },
    },
  },
})
