import { createFileRoute, Link, Outlet, redirect, useMatches } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '#/server/middleware.js'
import { DateFormatProvider } from '#/lib/date-format.js'

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

const navLinkClass =
  'text-sm font-medium text-gray-500 hover:text-gray-900 [&.active]:text-gray-900'

const subNavLinkClass =
  'text-sm font-medium px-3 py-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-50 [&.active]:text-gray-900 [&.active]:bg-gray-100'

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext()
  const matches = useMatches()
  const isFinancesRoute = matches.some((m) => m.fullPath.startsWith('/finances'))

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="text-lg font-semibold text-gray-900">
              Cajita
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className={navLinkClass}>
                Dashboard
              </Link>
              <Link
                to="/finances/movements"
                className={isFinancesRoute ? `${navLinkClass} !text-gray-900` : navLinkClass}
                activeOptions={{ exact: false }}
              >
                Finances
              </Link>
              <Link to="/tools" className={navLinkClass}>
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
      {isFinancesRoute && (
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-1.5">
            <Link to="/finances/movements" className={subNavLinkClass}>
              Movements
            </Link>
            <Link to="/finances/budgets" className={subNavLinkClass} activeOptions={{ exact: false }}>
              Budgets
            </Link>
            <Link to="/finances/categories" className={subNavLinkClass}>
              Categories
            </Link>
            <Link to="/finances/recurring" className={subNavLinkClass}>
              Recurring
            </Link>
            <Link to="/finances/settings" className={subNavLinkClass}>
              Settings
            </Link>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <DateFormatProvider>
          <Outlet />
        </DateFormatProvider>
      </main>
    </div>
  )
}
