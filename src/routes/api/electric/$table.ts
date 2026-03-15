import { createFileRoute } from '@tanstack/react-router'
import { parseCookies } from '#/server/cookies.js'
import { validateSession } from '#/server/session.js'

const ELECTRIC_URL = process.env.ELECTRIC_URL ?? 'http://localhost:3060'
const ALLOWED_TABLES = ['movements', 'categories', 'checkpoints', 'budgets', 'budget_items']
const TEAM_SCOPED_TABLES = ['movements', 'categories', 'checkpoints', 'budgets']

// Electric protocol query params to forward
const ELECTRIC_PARAMS = [
  'offset',
  'handle',
  'live',
  'cursor',
  'where',
  'columns',
  'replica',
]

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

        // Scope team-scoped tables by the user's team
        if (TEAM_SCOPED_TABLES.includes(table) && user.teamId) {
          const existingWhere = electricUrl.searchParams.get('where')
          const teamClause = `"team_id" = '${user.teamId}'`
          electricUrl.searchParams.set(
            'where',
            existingWhere ? `(${existingWhere}) AND ${teamClause}` : teamClause,
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
