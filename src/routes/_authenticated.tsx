import { useEffect, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { createFileRoute, Link, Outlet, redirect, useMatches } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '#/server/middleware.js'
import { DateFormatProvider } from '#/lib/date-format.js'
import { SearchButton } from '#/components/search/SearchButton'
import { SearchPalette } from '#/components/search/SearchPalette'

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
  const [searchOpen, setSearchOpen] = useState(false)

  // Global Cmd+K / Ctrl+K toggle for the search palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
                to="/finances/expense-categories"
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
            <SearchButton onClick={() => setSearchOpen(true)} />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-100 data-[state=open]:bg-gray-100">
                {user.picture && (
                  <img src={user.picture} alt="" width={28} height={28} className="rounded-full" />
                )}
                <span className="text-sm text-gray-600">{user.name}</span>
                <svg
                  viewBox="0 0 12 12"
                  className="h-3 w-3 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                >
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-medium text-gray-900">{user.name}</div>
                    <div className="truncate text-xs text-gray-500">{user.email}</div>
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-gray-100" />
                  <DropdownMenu.Item asChild>
                    <Link
                      to="/settings"
                      className="flex cursor-pointer rounded-md px-3 py-1.5 text-sm text-gray-700 outline-none select-none hover:bg-gray-50 data-[highlighted]:bg-gray-50"
                    >
                      Settings
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 h-px bg-gray-100" />
                  <form method="POST" action="/api/auth/logout">
                    {/* preventDefault keeps Radix from closing the menu on
                        select — closing unmounts this form before the browser
                        submits it, and the logout silently never happens. The
                        navigation tears the menu down anyway. */}
                    <DropdownMenu.Item asChild onSelect={(event) => event.preventDefault()}>
                      <button
                        type="submit"
                        className="flex w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-sm text-gray-700 outline-none select-none hover:bg-gray-50 data-[highlighted]:bg-gray-50"
                      >
                        Logout
                      </button>
                    </DropdownMenu.Item>
                  </form>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </nav>
      {searchOpen && <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />}
      {isFinancesRoute && (
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-1.5">
            <Link to="/finances/net-worth" className={subNavLinkClass}>
              Balances
            </Link>
            <Link
              to="/finances/expense-categories"
              className={subNavLinkClass}
              activeOptions={{ exact: false }}
            >
              Categories
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
