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

function YearTick({
  x,
  y,
  payload,
  data,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  data: MonthDatum[]
}) {
  const datum = data.find((d) => d.month === payload?.value)
  if (!datum?.isYearStart) return null
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fill="#9ca3af" fontSize={11} fontWeight={500}>
        {datum.yearLabel}
      </text>
    </g>
  )
}

function ProjectionTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: MonthDatum }>
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded border border-gray-200 bg-white px-3 py-2 shadow-sm text-sm">
      <p className="font-medium text-gray-700">{d.label}</p>
      <p className={`font-semibold ${d.balanceCents < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {formatCents(d.balanceCents)}
      </p>
    </div>
  )
}

export function ProjectionChart({ data }: { data: MonthDatum[] }) {
  const yearStartMonths = data.filter((d) => d.isYearStart).map((d) => d.month)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 16, left: 16 }}>
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

        <Tooltip content={<ProjectionTooltip />} />

        <Line
          type="monotone"
          dataKey="balanceCents"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
