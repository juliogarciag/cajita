import { lazy, Suspense, useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const NetWorthSummary = lazy(() =>
  import('#/components/NetWorthSummary.js').then((m) => ({ default: m.NetWorthSummary })),
)

const PinnedCategories = lazy(() =>
  import('#/components/PinnedCategories.js').then((m) => ({ default: m.PinnedCategories })),
)

const searchSchema = z.object({
  // How far back the net worth chart reaches. Absent = all of it.
  range: z.enum(['1y', '3y', '5y', 'all']).optional(),
  // Which slice of a reading the card reports: everything, the liquid part, or
  // the property part. Absent = net worth.
  metric: z.enum(['net', 'liquid', 'equity']).optional(),
})

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
  validateSearch: searchSchema,
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
          <PinnedCategories />
          <NetWorthSummary />
        </Suspense>
      )}
    </div>
  )
}
