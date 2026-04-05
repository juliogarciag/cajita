import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { checkpointsCollection } from '#/lib/checkpoints-collection.js'
import { movementsCollection } from '#/lib/movements-collection.js'
import { recurringMovementTemplatesCollection } from '#/lib/recurring-movement-templates-collection.js'
import { budgetsCollection } from '#/lib/budgets-collection.js'
import { toISODate } from '#/lib/format.js'
import { buildProjectionData } from '#/lib/projection.js'
import { ProjectionChart } from '#/components/ProjectionChart.js'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { user } = Route.useRouteContext()

  const { data: checkpoints } = useLiveQuery((q) =>
    q.from({ c: checkpointsCollection }).orderBy(({ c }) => c.created_at, 'desc'),
  )

  const { data: movements } = useLiveQuery((q) => q.from({ m: movementsCollection }))

  const { data: templates } = useLiveQuery((q) =>
    q.from({ t: recurringMovementTemplatesCollection }),
  )

  const { data: budgets } = useLiveQuery((q) => q.from({ b: budgetsCollection }))

  // Current confirmed ledger balance — same formula as MovementsTable
  const currentLedgerBalance = useMemo(() => {
    const today = toISODate(new Date())
    return movements
      .filter((m) => m.date <= today && (m.confirmed !== false || m.source !== 'recurring'))
      .reduce((sum, m) => sum + m.amount_cents, 0)
  }, [movements])

  // Starting balance: checkpoint-corrected when available
  // Formula: checkpoint.actual_cents + (ledger balance - checkpoint.expected_cents)
  // This anchors to the last verified bank balance and adds any confirmed drift since then.
  const startingBalance = useMemo(() => {
    const latest = checkpoints[0] ?? null
    if (!latest) return currentLedgerBalance
    return latest.actual_cents + (currentLedgerBalance - latest.expected_cents)
  }, [checkpoints, currentLedgerBalance])

  const projectionData = useMemo(
    () => buildProjectionData(startingBalance, templates, budgets, new Date().getFullYear()),
    [startingBalance, templates, budgets],
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-gray-600">Welcome back, {user.name ?? user.email}.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700">5-Year Balance Projection</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Based on active recurring templates and current-year budgets
          </p>
        </div>
        <ProjectionChart data={projectionData} />
      </div>
    </div>
  )
}
