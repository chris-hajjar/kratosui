import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, ColorType } from 'lightweight-charts'
import type { Widget } from '../../../types'

interface Props {
  widget: Widget
}

export function CandlestickChart({ widget }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: '#0f1117' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: {
        vertLine: { color: '#6b7280' },
        horzLine: { color: '#6b7280' },
      },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    const xKey = widget.x_key ?? 'time'
    type Candle = Record<string, number>
    const candles = (widget.data as unknown as Candle[])
      .filter(d => d.open != null && d.close != null)
      .sort((a, b) => a[xKey] - b[xKey])

    series.setData(candles.map(c => ({
      time: c[xKey] as unknown as import('lightweight-charts').Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })))

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width
      if (width) chart.applyOptions({ width })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [widget])

  return <div ref={containerRef} style={{ width: '100%' }} />
}
