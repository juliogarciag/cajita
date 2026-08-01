import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db/index.js'
import { parseCookies } from '#/server/cookies.js'
import { validateSession } from '#/server/session.js'

const ELECTRIC_URL = process.env.ELECTRIC_URL ?? 'http://localhost:3060'
const ALLOWED_TABLES = [
  'expense_categories',
  'expense_items',
  'expense_item_notes',
  'color_bookmarks',
  'wealth_sources',
  'balance_snapshots',
  'balance_entries',
  'income_receipts',
  'tax_retentions',
  'tax_years',
  'team_members',
]
const TEAM_SCOPED_TABLES = [
  'expense_categories',
  'expense_items',
  'expense_item_notes',
  'color_bookmarks',
  'wealth_sources',
  'balance_snapshots',
  'balance_entries',
  'income_receipts',
  'tax_retentions',
  'tax_years',
]

// Electric protocol query params to forward. `where` is deliberately absent:
// the team scope below is the only thing keeping one team's rows away from
// another's, and a client-supplied `where` gets to sit next to it in the same
// SQL expression. `1=1) OR (1=1` closes its own paren, and because AND binds
// tighter than OR the scope collapses to a no-op. No collection sends either
// `where` or `columns`, so forwarding them was surface with no upside.
const ELECTRIC_PARAMS = ['offset', 'handle', 'live', 'cursor', 'replica']

export const Route = createFileRoute('/api/electric/$table')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Auth check
        const cookies = parseCookies(request)
        const sessionToken = cookies['session']
        if (!sessionToken) {
          return new Response('Unauthorized', { status: 401 })
        }
        const user = await validateSession(sessionToken)
        if (!user) {
          return new Response('Unauthorized', { status: 401 })
        }

        const { table } = params
        if (!ALLOWED_TABLES.includes(table)) {
          return new Response('Table not allowed', { status: 403 })
        }

        const url = new URL(request.url)
        const electricUrl = new URL(`${ELECTRIC_URL}/v1/shape`)

        // Set the table
        electricUrl.searchParams.set('table', table)

        // Forward Electric protocol params
        for (const param of ELECTRIC_PARAMS) {
          const value = url.searchParams.get(param)
          if (value !== null) {
            electricUrl.searchParams.set(param, value)
          }
        }

        // Scope team-scoped tables by the user's team. This is the whole of the
        // tenant boundary, so it owns `where` outright — nothing is merged into
        // it. Both values interpolated here are uuids read back out of Postgres.
        if (TEAM_SCOPED_TABLES.includes(table) && user.teamId) {
          electricUrl.searchParams.set('where', `"team_id" = '${user.teamId}'`)
        }

        // team_members: expose users who share a team — pre-fetch user IDs to avoid subquery
        if (table === 'team_members' && user.teamId) {
          const memberships = await db
            .selectFrom('team_memberships')
            .select('user_id')
            .where('team_id', '=', user.teamId)
            .execute()

          const userIds = memberships.map((m) => m.user_id)
          if (userIds.length === 0) {
            return new Response('[]', { status: 200 })
          }

          electricUrl.searchParams.set('table', 'users')
          electricUrl.searchParams.set(
            'where',
            `"id" IN (${userIds.map((id) => `'${id}'`).join(', ')})`,
          )
        }

        try {
          const response = await fetch(electricUrl.toString(), {
            headers: {
              'Accept-Encoding': 'identity',
            },
          })

          const headers = new Headers(response.headers)
          headers.delete('content-encoding')
          headers.delete('content-length')

          // Electric answers with `public, s-maxage=3600` because a raw shape
          // URL describes its own contents. Ours doesn't: the team filter is
          // added here, invisibly, so two teams share one URL and the response
          // is only correct for the caller. Any shared cache in front of this
          // would hand one household's balances to another.
          headers.set('cache-control', 'private, no-store')
          // Same reasoning — Electric's `*` is meant for a public shape API.
          headers.delete('access-control-allow-origin')

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          })
        } catch (error) {
          console.error('Electric proxy error:', error)
          return new Response('Electric sync unavailable', { status: 502 })
        }
      },
    },
  },
})
