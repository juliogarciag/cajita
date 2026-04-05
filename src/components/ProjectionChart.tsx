import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCents } from '#/lib/format.js'
import type { MonthDatum } from '#/lib/projection.js'

// Fixed color palette for scenario lines (base line uses blue #3b82f6)
export const SCENARIO_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316']

export type ScenarioLine = {
  name: string
  data: MonthDatum[]
  color: string
}

function YearTick({
  x,
  y,
  payload,
  data,
}: {
  x?: number | string
  y?: number | string
  payload?: { value: string }
  data: MonthDatum[]
}) {
  const datum = data.find((d) => d.month === payload?.value)
  if (!datum?.isYearStart) return null
  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fill="#9ca3af" fontSize={11} fontWeight={500}>
        {datum.yearLabel}
      </text>
    </g>
  )
}

function ProjectionTooltip({
  active,
  payload,
  scenarios,
}: {
  active?: boolean
  payload?: Array<{ dataKey: string; payload: MonthDatum; color: string; value: number }>
  scenarios: ScenarioLine[]
}) {
  if (!active || !payload?.length) return null
  const base = payload.find((p) => p.dataKey === 'balanceCents')
  if (!base) return null
  const d = base.payload

  return (
    <div className="rounded border border-gray-200 bg-white px-3 py-2 shadow-sm text-sm min-w-[140px]">
      <p className="font-medium text-gray-700 mb-1">{d.label}</p>
      {/* Base line */}
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
        <span className={`font-semibold ${d.balanceCents < 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {formatCents(d.balanceCents)}
        </span>
      </div>
      {/* Scenario lines */}
      {scenarios.map((scenario) => {
        const entry = payload.find((p) => p.dataKey === `scenario__${scenario.name}`)
        if (!entry) return null
        return (
          <div key={scenario.name} className="flex items-center gap-1.5 mt-0.5">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: scenario.color }}
            />
            <span className={`font-semibold ${entry.value < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatCents(entry.value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Merge base data and scenario data into a single array keyed by month for Recharts.
 * Each entry has the base balanceCents plus a `scenario__<name>` key per scenario.
 */
function mergeChartData(
  baseData: MonthDatum[],
  scenarios: ScenarioLine[],
): Array<Record<string, unknown>> {
  return baseData.map((d) => {
    const entry: Record<string, unknown> = { ...d }
    for (const scenario of scenarios) {
      const match = scenario.data.find((s) => s.month === d.month)
      if (match) {
        entry[`scenario__${scenario.name}`] = match.balanceCents
      }
    }
    return entry
  })
}

export function ProjectionChart({
  data,
  scenarios = [],
}: {
  data: MonthDatum[]
  scenarios?: ScenarioLine[]
}) {
  const yearStartMonths = data.filter((d) => d.isYearStart).map((d) => d.month)
  const mergedData = mergeChartData(data, scenarios)

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={mergedData} margin={{ top: 8, right: 16, bottom: 16, left: 16 }}>
          {/* Zero reference line */}
          <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="4 4" />

          {/* Vertical year-boundary markers */}
          {yearStartMonths.map((m) => (
            <ReferenceLine key={m} x={m} stroke="#f3f4f6" strokeWidth={1} />
          ))}

          <XAxis
            dataKey="month"
            ticks={yearStartMonths}
            tick={(props) => <YearTick {...props} data={data} />}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
            interval={0}
            height={28}
          />

          <YAxis
            tickFormatter={(v) => formatCents(v)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            width={82}
          />

          <Tooltip content={<ProjectionTooltip scenarios={scenarios} />} />

          {/* Base line */}
          <Line
            type="monotone"
            dataKey="balanceCents"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
          />

          {/* Scenario lines */}
          {scenarios.map((scenario) => (
            <Line
              key={scenario.name}
              type="monotone"
              dataKey={`scenario__${scenario.name}`}
              stroke={scenario.color}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: scenario.color }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      {scenarios.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-4 h-0.5 bg-blue-500 shrink-0" />
            Base
          </div>
          {scenarios.map((scenario) => (
            <div key={scenario.name} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className="inline-block w-4 h-0.5 shrink-0"
                style={{ backgroundColor: scenario.color }}
              />
              {scenario.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
