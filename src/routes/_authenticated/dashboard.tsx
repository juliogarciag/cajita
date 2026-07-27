import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

const NetWorthSummary = lazy(() =>
  import('#/components/NetWorthSummary.js').then((m) => ({ default: m.NetWorthSummary })),
)

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { user } = Route.useRouteContext()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-gray-600">Welcome back, {user.name ?? user.email}.</p>
      </div>

      {mounted && (
        <Suspense>
          <NetWorthSummary />
        </Suspense>
      )}
    </div>
  )
}
