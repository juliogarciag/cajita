import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { checkpointsCollection } from '#/lib/checkpoints-collection.js'
import { movementsCollection } from '#/lib/movements-collection.js'
import { recurringMovementTemplatesCollection } from '#/lib/recurring-movement-templates-collection.js'
import { budgetsCollection } from '#/lib/budgets-collection.js'
import { projectionScenariosCollection } from '#/lib/projection-scenarios-collection.js'
import { toISODate } from '#/lib/format.js'
import { buildProjectionData } from '#/lib/projection.js'
import { findScript } from '#/lib/projection-scripts/index.js'
import { applyAdjustments } from '#/lib/projection-scripts/apply.js'
import { ProjectionChart, SCENARIO_COLORS } from '#/components/ProjectionChart.js'
import { ScenariosPanel } from '#/components/ScenariosPanel.js'
import type { ScenarioLine } from '#/components/ProjectionChart.js'

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

  const { data: scenarios } = useLiveQuery((q) =>
    q.from({ s: projectionScenariosCollection }).orderBy(({ s }) => s.created_at, 'asc'),
  )

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

  const currentYear = new Date().getFullYear()

  const projectionData = useMemo(
    () => buildProjectionData(startingBalance, templates, budgets, currentYear),
    [startingBalance, templates, budgets, currentYear],
  )

  // Build scenario lines — one per active, valid scenario
  const scenarioLines = useMemo<ScenarioLine[]>(() => {
    const today = toISODate(new Date())
    const lines: ScenarioLine[] = []
    let colorIndex = 0

    for (const scenario of scenarios) {
      if (!scenario.active) continue

      const script = findScript(scenario.script_id)
      if (!script) continue

      let raw: Record<string, unknown>
      try {
        raw = JSON.parse(scenario.inputs_json) as Record<string, unknown>
      } catch {
        continue
      }

      let adjustments
      try {
        adjustments = script.run(raw as never, { today })
      } catch {
        continue
      }

      const adjustedTemplates = applyAdjustments(templates, adjustments)
      const data = buildProjectionData(startingBalance, adjustedTemplates, budgets, currentYear)

      lines.push({
        name: scenario.name,
        data,
        color: SCENARIO_COLORS[colorIndex % SCENARIO_COLORS.length],
      })
      colorIndex++
    }

    return lines
  }, [scenarios, templates, budgets, startingBalance, currentYear])

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
        <ProjectionChart data={projectionData} scenarios={scenarioLines} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <ScenariosPanel scenarios={scenarios} templates={templates} />
      </div>
    </div>
  )
}
