import type { Widget } from '../../types'
import { CandlestickChart } from './charts/CandlestickChart'
import { LineChart } from './charts/LineChart'
import { AreaChart } from './charts/AreaChart'
import { BarChart } from './charts/BarChart'
import { GaugeChart } from './charts/GaugeChart'

interface Props {
  widgets: Widget[]
}

function ChartCard({ widget }: { widget: Widget }) {
  return (
    <div style={{
      background: '#0f1117',
      border: '1px solid #1f2937',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      {widget.title && (
        <div style={{
          padding: '8px 14px',
          borderBottom: '1px solid #1f2937',
          fontSize: 12,
          fontWeight: 600,
          color: '#9ca3af',
          letterSpacing: '0.02em',
        }}>
          {widget.title}
        </div>
      )}
      <div style={{ padding: '12px 14px' }}>
        {widget.widget_type === 'candlestick' && <CandlestickChart widget={widget} />}
        {widget.widget_type === 'line' && <LineChart widget={widget} />}
        {widget.widget_type === 'area' && <AreaChart widget={widget} />}
        {widget.widget_type === 'bar' && <BarChart widget={widget} />}
        {widget.widget_type === 'gauge' && <GaugeChart widget={widget} />}
      </div>
    </div>
  )
}

export function WidgetRenderer({ widgets }: Props) {
  if (!widgets || widgets.length === 0) return null
  return (
    <div style={{ marginBottom: 12 }}>
      {widgets.map((w, i) => (
        <ChartCard key={i} widget={w} />
      ))}
    </div>
  )
}
