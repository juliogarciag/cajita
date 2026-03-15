import { createFileRoute } from '@tanstack/react-router'
import {
  upsertUser,
  createSession,
  ensureTeamMembership,
  createIsolatedTeam,
} from '#/server/session.js'
import { serializeCookie } from '#/server/cookies.js'
import { DEV_EMAIL } from '#/config/allowed-users.js'

export const Route = createFileRoute('/api/auth/dev-login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (process.env.NODE_ENV !== 'development') {
          return new Response(null, { status: 404 })
        }

        const url = new URL(request.url)
        const isolated = url.searchParams.get('isolated') === 'true'

        let userId: string

        if (isolated) {
          // Create a unique user + team for test isolation
          const uniqueId = crypto.randomUUID().slice(0, 8)
          userId = await upsertUser({
            email: `test-${uniqueId}@localhost`,
            name: `Test User ${uniqueId}`,
            picture: '',
          })
          await createIsolatedTeam(userId, `test-team-${uniqueId}`)
        } else {
          userId = await upsertUser({
            email: DEV_EMAIL,
            name: 'Dev User',
            picture: '',
          })
          await ensureTeamMembership(userId)
        }

        const token = await createSession(userId)

        console.log(`[dev-login] Session created (isolated=${isolated})`)

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
