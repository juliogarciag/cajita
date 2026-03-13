import { createFileRoute } from '@tanstack/react-router'
import { upsertUser, createSession } from '#/server/session.js'
import { serializeCookie } from '#/server/cookies.js'
import { DEV_EMAIL } from '#/config/allowed-users.js'

export const Route = createFileRoute('/api/auth/dev-login')({
  server: {
    handlers: {
      GET: async () => {
        if (process.env.NODE_ENV !== 'development') {
          return new Response(null, { status: 404 })
        }

        const userId = await upsertUser({
          email: DEV_EMAIL,
          name: 'Dev User',
          picture: '',
        })

        const token = await createSession(userId)

        console.log(`[dev-login] Session created for ${DEV_EMAIL}`)

        return new Response(null, {
          status: 302,
          headers: {
            Location: '/dashboard',
            'Set-Cookie': serializeCookie('session', token, {
              path: '/',
              httpOnly: true,
              maxAge: 7 * 24 * 60 * 60,
              sameSite: 'lax',
            }),
          },
        })
      },
    },
  },
})
