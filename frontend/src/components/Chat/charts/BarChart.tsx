import {
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar,
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

export function BarChart({ widget }: Props) {
  const keys = widget.y_keys.length > 0 ? widget.y_keys : ['value']

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ReBarChart data={widget.data as Record<string, unknown>[]} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey={widget.x_key} stroke="#6b7280" tick={{ fontSize: 11, fill: '#6b7280' }} />
        <YAxis stroke="#6b7280" tick={{ fontSize: 11, fill: '#6b7280' }} width={60} />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#9ca3af' }}
          itemStyle={{ color: '#e5e7eb' }}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />}
        {keys.map((key, i) => (
          <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
        ))}
      </ReBarChart>
    </ResponsiveContainer>
  )
}
