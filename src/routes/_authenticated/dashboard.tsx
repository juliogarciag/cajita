import { useMemo, useState } from 'react'
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

const YEAR_OPTIONS = [5, 10, 15, 20, 30] as const
type YearOption = (typeof YEAR_OPTIONS)[number]

function DashboardPage() {
  const { user } = Route.useRouteContext()
  const [years, setYears] = useState<YearOption>(5)

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
  const startingBalance = useMemo(() => {
    const latest = checkpoints[0] ?? null
    if (!latest) return currentLedgerBalance
    return latest.actual_cents + (currentLedgerBalance - latest.expected_cents)
  }, [checkpoints, currentLedgerBalance])

  const currentYear = new Date().getFullYear()
  const months = years * 12

  const projectionData = useMemo(
    () => buildProjectionData(startingBalance, templates, budgets, currentYear, months),
    [startingBalance, templates, budgets, currentYear, months],
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
        const v = scenario.inputs_json
        raw = (typeof v === 'object' && v !== null ? v : JSON.parse(v as string)) as Record<
          string,
          unknown
        >
      } catch {
        continue
      }

      let adjustments
      try {
        adjustments = script.run(raw as never, { today, templates })
      } catch {
        continue
      }

      const adjustedTemplates = applyAdjustments(templates, adjustments)
      const data = buildProjectionData(
        startingBalance,
        adjustedTemplates,
        budgets,
        currentYear,
        months,
      )

      lines.push({
        name: scenario.name,
        data,
        color: SCENARIO_COLORS[colorIndex % SCENARIO_COLORS.length],
      })
      colorIndex++
    }

    return lines
  }, [scenarios, templates, budgets, startingBalance, currentYear, months])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-gray-600">Welcome back, {user.name ?? user.email}.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">{years}-Year Balance Projection</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Based on active recurring templates and current-year budgets
            </p>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {YEAR_OPTIONS.map((y) => (
              <button
                key={y}
                onClick={() => setYears(y)}
                className={`px-2.5 py-1 font-medium transition-colors ${
                  y === years ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {y}Y
              </button>
            ))}
          </div>
        </div>
        <ProjectionChart data={projectionData} scenarios={scenarioLines} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <ScenariosPanel scenarios={scenarios} templates={templates} />
      </div>
    </div>
  )
}
