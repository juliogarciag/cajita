import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '#/server/middleware.js'

const getAuthenticatedUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return context.user
  })

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    try {
      const user = await getAuthenticatedUser()
      return { user }
    } catch {
      throw redirect({ to: '/' })
    }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { user } = Route.useRouteContext()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <h1>Dashboard</h1>
      {user.picture && (
        <img
          src={user.picture}
          alt="Profile"
          width={64}
          height={64}
          style={{ borderRadius: '50%' }}
        />
      )}
      <p>{user.name}</p>
      <p>{user.email}</p>
      <form method="POST" action="/api/auth/logout">
        <button type="submit">Logout</button>
      </form>
    </div>
  )
}
