import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '#/server/middleware.js'

const getAuthenticatedUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return context.user
  })

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    try {
      const user = await getAuthenticatedUser()
      return { user }
    } catch {
      throw redirect({ to: '/' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext()

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="text-lg font-semibold text-gray-900">
              Cajita
            </Link>
            <div className="flex items-center gap-4">
              <Link
                to="/dashboard"
                className="text-sm text-gray-600 hover:text-gray-900 [&.active]:font-medium [&.active]:text-gray-900"
              >
                Dashboard
              </Link>
              <Link
                to="/tools"
                className="text-sm text-gray-600 hover:text-gray-900 [&.active]:font-medium [&.active]:text-gray-900"
              >
                Tools
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user.picture && (
              <img
                src={user.picture}
                alt="Profile"
                width={28}
                height={28}
                className="rounded-full"
              />
            )}
            <span className="text-sm text-gray-600">{user.name}</span>
            <form method="POST" action="/api/auth/logout">
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
