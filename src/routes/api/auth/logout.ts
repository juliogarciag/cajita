import { createFileRoute } from '@tanstack/react-router'
import { destroySession } from '#/server/session.js'
import { parseCookies, deleteCookieHeader } from '#/server/cookies.js'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cookies = parseCookies(request)
        const sessionToken = cookies['session']

        if (sessionToken) {
          await destroySession(sessionToken)
        }

        const headers = new Headers()
        headers.append('Set-Cookie', deleteCookieHeader('session'))
        headers.set('Location', '/')

        return new Response(null, { status: 302, headers })
      },
    },
  },
})
