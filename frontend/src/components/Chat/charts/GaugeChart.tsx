import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
import type { Widget } from '../../../types'

interface Props {
  widget: Widget
}

function rsiColor(value: number): string {
  if (value >= 70) return '#ef4444'
  if (value <= 30) return '#22c55e'
  return '#60a5fa'
}

export function GaugeChart({ widget }: Props) {
  const raw = widget.data[0]
  const value = typeof raw?.value === 'number' ? raw.value : 50
  const color = rsiColor(value)

  const chartData = [{ value, fill: color }]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ width: 180, height: 140, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="80%"
            innerRadius="70%"
            outerRadius="100%"
            startAngle={180}
            endAngle={0}
            data={chartData}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: '#1f2937' }}
              dataKey="value"
              angleAxisId={0}
              cornerRadius={4}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div style={{ fontSize: 48, fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(1)}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          {value >= 70 ? 'Overbought' : value <= 30 ? 'Oversold' : 'Neutral'}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 12, fontSize: 11, color: '#6b7280' }}>
          <span style={{ color: '#22c55e' }}>≤30 Oversold</span>
          <span style={{ color: '#ef4444' }}>≥70 Overbought</span>
        </div>
      </div>
    </div>
  )
}
