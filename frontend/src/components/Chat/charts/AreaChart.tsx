import {
  ResponsiveContainer,
  AreaChart as ReAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { Widget } from '../../../types'

const COLORS = ['#60a5fa', '#34d399', '#f59e0b', '#f87171', '#a78bfa']

interface Props {
  widget: Widget
}

export function AreaChart({ widget }: Props) {
  const keys = widget.y_keys.length > 0 ? widget.y_keys : ['value']

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ReAreaChart data={widget.data as Record<string, unknown>[]} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <defs>
          {keys.map((key, i) => (
            <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey={widget.x_key} stroke="#6b7280" tick={{ fontSize: 11, fill: '#6b7280' }} />
        <YAxis stroke="#6b7280" tick={{ fontSize: 11, fill: '#6b7280' }} width={60} />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#9ca3af' }}
          itemStyle={{ color: '#e5e7eb' }}
        />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />}
        {keys.map((key, i) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            fill={`url(#grad-${key})`}
            strokeWidth={1.5}
            dot={false}
          />
        ))}
      </ReAreaChart>
    </ResponsiveContainer>
  )
}
