import { useEffect, useState, useCallback } from 'react'

interface DailyRow  { day: string; requests: number; total_tokens: number; cost: number }
interface ModelRow  {
  model: string; requests: number; total_tokens: number; cost: number
  avg_latency_ms: number | null
  latency: { avg: number; p50: number; p95: number } | null
}
interface SkillRow  { skill_name: string; requests: number; total_tokens: number; cost: number; avg_cost: number; avg_latency_ms: number | null }
interface LogRow    { id: number; timestamp: number; model: string; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number; skill_name: string | null; duration_ms: number | null }
interface ToolRow   { tool_name: string; calls: number; unique_requests: number; last_used: number; skills: string | null; calls_7d: number }
interface Totals    {
  requests: number; input_tokens: number; output_tokens: number; total_tokens: number
  total_cost: number; avg_cost: number
  avg_latency_ms: number | null; p95_latency_ms: number | null
  avg_input_tokens: number; avg_output_tokens: number
  projected_monthly: number | null
}
interface Stats { totals: Totals; daily: DailyRow[]; models: ModelRow[] }

interface Props { onClose: () => void }

// ── formatters ──────────────────────────────────────────────────────────────

function fmtCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n >= 1)  return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  return `$${n.toFixed(4)}`
}

function fmtNum(n: number): string {
  return n.toLocaleString()
}

function fmtTime(ts: number): string {
  const diff = Date.now() / 1000 - ts
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(ts * 1000).toLocaleDateString()
}

function fmtLatency(ms: number | null | undefined): string {
  if (ms == null) return '–'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function shortModel(m: string): string {
  return m.replace('openai:', '').replace('anthropic:', '')
}

function shortDate(day: string): string {
  return new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isoDate(ts: number): string {
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

// ── sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-sub)', borderRadius: 10,
      padding: '16px 20px', flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ? '#4ade80' : 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

type ChartMetric = 'cost' | 'requests' | 'tokens'

const Y_TICKS = 4
const BAR_H   = 160
const X_LABEL_H = 30

function niceMax(raw: number): number {
  if (raw === 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}

function DailyChart({ daily }: { daily: DailyRow[] }) {
  const [metric,  setMetric]  = useState<ChartMetric>('cost')
  const [hovered, setHovered] = useState<number | null>(null)
  const data = daily.slice(-30)

  const getValue = (d: DailyRow) =>
    metric === 'cost' ? d.cost : metric === 'requests' ? d.requests : d.total_tokens

  const rawMax = Math.max(...data.map(getValue), 0)
  const maxVal = niceMax(rawMax)
  const ticks  = Array.from({ length: Y_TICKS + 1 }, (_, i) => (i / Y_TICKS) * maxVal)

  const fmtY = (v: number) =>
    metric === 'cost'     ? fmtCost(v) :
    metric === 'tokens'   ? (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))) :
                            String(Math.round(v))

  const barGrad =
    metric === 'cost'     ? { base: '#16a34a', top: '#4ade80', solid: '#22c55e' } :
    metric === 'requests' ? { base: '#1d4ed8', top: '#60a5fa', solid: '#3b82f6' } :
                            { base: '#7c3aed', top: '#c084fc', solid: '#a855f7' }

  const labelEvery = data.length > 20 ? 5 : data.length > 10 ? 3 : 1

  const pillBase: React.CSSProperties = {
    padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)',
  }
  const pillActive: React.CSSProperties = {
    ...pillBase, background: 'var(--bg-input)', color: 'var(--text-primary)', borderColor: 'var(--border-sub)',
  }

  if (data.length === 0) return <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No data yet</div>

  const hd = hovered !== null ? data[hovered] : null

  return (
    <div>
      {/* metric toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['cost', 'requests', 'tokens'] as ChartMetric[]).map(m => (
          <button key={m} onClick={() => setMetric(m)} style={metric === m ? pillActive : pillBase}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* chart layout: [y-axis col] [bars + grid] */}
      <div style={{ display: 'flex', gap: 0 }}>

        {/* Y-axis labels — reversed so 0 is at bottom */}
        <div style={{
          width: 52, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          paddingBottom: X_LABEL_H, paddingRight: 10, flexShrink: 0,
        }}>
          {[...ticks].reverse().map((tick, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--text-faint)', textAlign: 'right', lineHeight: 1 }}>
              {fmtY(tick)}
            </div>
          ))}
        </div>

        {/* chart area */}
        <div style={{ flex: 1, position: 'relative' }}>

          {/* horizontal grid lines */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: X_LABEL_H, pointerEvents: 'none' }}>
            {ticks.map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                bottom: `${(i / Y_TICKS) * 100}%`,
                left: 0, right: 0,
                borderTop: i === 0
                  ? '1px solid var(--border-sub)'
                  : '1px dashed var(--border-faint)',
              }} />
            ))}
          </div>

          {/* bars + x-labels */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: BAR_H + X_LABEL_H, position: 'relative' }}>
            {data.map((d, i) => {
              const v   = getValue(d)
              const h   = maxVal > 0 ? Math.max(3, (v / maxVal) * BAR_H) : 3
              const isH = hovered === i
              const showLabel = i % labelEvery === 0 || i === data.length - 1
              return (
                <div
                  key={d.day}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, cursor: 'default' }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div style={{
                    width: '100%', height: h,
                    background: isH
                      ? barGrad.solid
                      : `linear-gradient(to top, ${barGrad.base}, ${barGrad.top})`,
                    borderRadius: '3px 3px 0 0',
                    boxShadow: isH ? `0 0 0 1px ${barGrad.solid}40` : undefined,
                    transition: 'background 0.15s ease',
                  }} />
                  {/* spacer so x-labels sit on the baseline */}
                  <div style={{
                    height: X_LABEL_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10,
                    color: isH ? 'var(--text-primary)' : 'var(--text-faint)',
                    whiteSpace: 'nowrap',
                    visibility: showLabel || isH ? 'visible' : 'hidden',
                    fontWeight: isH ? 600 : 400,
                  }}>
                    {shortDate(d.day)}
                  </div>
                </div>
              )
            })}
          </div>

          {/* hover tooltip */}
          {hd !== null && hovered !== null && (() => {
            const pct = (hovered + 0.5) / data.length
            // flip to right-align when bar is in the right third
            const flipRight = pct > 0.65
            return (
              <div style={{
                position: 'absolute',
                bottom: X_LABEL_H + Math.max(3, (getValue(hd) / maxVal) * BAR_H) + 10,
                left:  flipRight ? undefined : `${pct * 100}%`,
                right: flipRight ? `${(1 - pct) * 100}%` : undefined,
                transform: flipRight ? undefined : 'translateX(-50%)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-sub)',
                borderRadius: 8,
                padding: '9px 13px',
                fontSize: 12,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 20,
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>{shortDate(hd.day)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                    <span style={{ color: 'var(--text-faint)' }}>Cost</span>
                    <span style={{ color: '#4ade80', fontWeight: 600 }}>{fmtCost(hd.cost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                    <span style={{ color: 'var(--text-faint)' }}>Tokens</span>
                    <span style={{ color: 'var(--text-primary)' }}>{fmtNum(hd.total_tokens)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                    <span style={{ color: 'var(--text-faint)' }}>Requests</span>
                    <span style={{ color: 'var(--text-primary)' }}>{hd.requests}</span>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

function LatencyTable({ models }: { models: ModelRow[] }) {
  const hasLatency = models.some(m => m.latency != null)
  if (!hasLatency) return null

  const p95Color = (ms: number) =>
    ms <= 2000 ? '#4ade80' : ms <= 5000 ? '#f59e0b' : '#ef4444'

  const th: React.CSSProperties = {
    textAlign: 'left', color: 'var(--text-faint)', fontWeight: 500, fontSize: 12,
    padding: '0 14px 10px 0', borderBottom: '1px solid var(--border-sub)',
  }
  const td: React.CSSProperties = { padding: '9px 14px 9px 0', verticalAlign: 'middle', fontSize: 13 }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Model', 'Avg', 'p50', 'p95', 'Requests'].map(h => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {models.filter(m => m.latency).map(m => (
            <tr key={m.model} style={{ borderBottom: '1px solid var(--border-faint)' }}>
              <td style={{ ...td, color: 'var(--text-primary)' }}>{shortModel(m.model)}</td>
              <td style={{ ...td, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fmtLatency(m.latency!.avg)}</td>
              <td style={{ ...td, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fmtLatency(m.latency!.p50)}</td>
              <td style={{ ...td, fontFamily: 'monospace', color: p95Color(m.latency!.p95) }}>{fmtLatency(m.latency!.p95)}</td>
              <td style={{ ...td, color: 'var(--text-faint)' }}>{fmtNum(m.requests)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ModelBreakdown({ models }: { models: ModelRow[] }) {
  const maxCost = Math.max(...models.map(m => m.cost), 0.0001)
  const total   = models.reduce((s, m) => s + m.cost, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {models.map(m => {
        const pct = total > 0 ? (m.cost / total) * 100 : 0
        const bar = (m.cost / maxCost) * 100
        return (
          <div key={m.model}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--text-primary)' }}>{shortModel(m.model)}</span>
              <span style={{ display: 'flex', gap: 20 }}>
                <span style={{ color: 'var(--text-muted)' }}>{fmtNum(m.total_tokens)} tokens</span>
                {m.avg_latency_ms != null && (
                  <span style={{ color: 'var(--text-muted)', minWidth: 52, textAlign: 'right' }}>{fmtLatency(m.avg_latency_ms)}</span>
                )}
                <span style={{ color: '#4ade80', minWidth: 58, textAlign: 'right' }}>{fmtCost(m.cost)}</span>
                <span style={{ color: 'var(--text-faint)', minWidth: 38, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border-faint)', borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${bar}%`, background: '#4ade80', borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SkillBreakdown({ skills }: { skills: SkillRow[] }) {
  if (skills.length === 0) return null
  const maxCost = Math.max(...skills.map(s => s.cost), 0.0001)
  const total   = skills.reduce((sum, s) => sum + s.cost, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {skills.map(s => {
        const pct = total > 0 ? (s.cost / total) * 100 : 0
        const bar = (s.cost / maxCost) * 100
        return (
          <div key={s.skill_name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{s.skill_name}</span>
              <span style={{ display: 'flex', gap: 20 }}>
                <span style={{ color: 'var(--text-muted)' }}>{fmtNum(s.total_tokens)} tokens</span>
                {s.avg_latency_ms != null && (
                  <span style={{ color: 'var(--text-muted)', minWidth: 52, textAlign: 'right' }}>{fmtLatency(s.avg_latency_ms)}</span>
                )}
                <span style={{ color: '#4ade80', minWidth: 58, textAlign: 'right' }}>{fmtCost(s.cost)}</span>
                <span style={{ color: 'var(--text-faint)', minWidth: 38, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border-faint)', borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${bar}%`, background: '#a78bfa', borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LogTable({ logs, avgCost }: { logs: LogRow[]; avgCost: number }) {
  const th: React.CSSProperties = {
    textAlign: 'left', color: 'var(--text-faint)', fontWeight: 500, fontSize: 12,
    padding: '0 14px 10px 0', borderBottom: '1px solid var(--border-sub)',
  }
  const td: React.CSSProperties = { padding: '9px 14px 9px 0', verticalAlign: 'middle' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Time', 'Model', 'Input', 'Output', 'Total', 'Cost', 'Skill', 'Latency'].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map(log => {
            const isExpensive = avgCost > 0 && log.cost_usd > avgCost * 3
            const isSlow = log.duration_ms != null && log.duration_ms > 10000
            return (
              <tr
                key={log.id}
                style={{
                  borderBottom: '1px solid var(--border-faint)',
                  borderLeft: isExpensive ? '3px solid #f59e0b' : undefined,
                  paddingLeft: isExpensive ? 0 : undefined,
                }}
              >
                <td style={{ ...td, color: 'var(--text-muted)' }} title={isoDate(log.timestamp)}>{fmtTime(log.timestamp)}</td>
                <td style={{ ...td, color: 'var(--text-primary)' }}>{shortModel(log.model)}</td>
                <td style={{ ...td, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{fmtNum(log.input_tokens)}</td>
                <td style={{ ...td, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{fmtNum(log.output_tokens)}</td>
                <td style={{ ...td, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{fmtNum(log.total_tokens)}</td>
                <td style={{ ...td, color: '#4ade80' }}>{fmtCost(log.cost_usd)}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{log.skill_name ?? '–'}</td>
                <td style={{ ...td, color: isSlow ? '#f59e0b' : 'var(--text-muted)' }}>
                  {isSlow && <span title="Slow request">⚡ </span>}
                  {log.duration_ms != null ? fmtLatency(log.duration_ms) : '–'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ToolActivity({ tools }: { tools: ToolRow[] }) {
  if (tools.length === 0) return <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No tool calls recorded yet.</div>
  const maxCalls = Math.max(...tools.map(t => t.calls), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tools.map(t => {
        const bar = (t.calls / maxCalls) * 100
        const allRecent = t.calls_7d === t.calls
        const noneRecent = t.calls_7d === 0
        return (
          <div key={t.tool_name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{t.tool_name}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.unique_requests} req</span>
                {/* 7d badge */}
                <span style={{
                  fontSize: 10, padding: '1px 7px', borderRadius: 10,
                  background: 'var(--border-faint)',
                  color: noneRecent ? 'var(--text-faint)' : 'var(--text-muted)',
                  opacity: noneRecent ? 0.5 : 1,
                }}>
                  {allRecent ? 'all recent' : `7d: ${t.calls_7d}`}
                </span>
                <span style={{ color: '#7dd3fc', minWidth: 52, textAlign: 'right' }}>
                  {t.calls} call{t.calls !== 1 ? 's' : ''}
                </span>
                <span style={{ color: 'var(--text-faint)', fontSize: 11, minWidth: 60, textAlign: 'right' }}>
                  {fmtTime(t.last_used)}
                </span>
              </div>
            </div>
            <div style={{ height: 5, background: 'var(--border-faint)', borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${bar}%`, background: 'linear-gradient(to right, #1d4ed8, #7dd3fc)', borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 36 }}>📊</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-muted)' }}>No usage data yet</div>
      <div style={{ fontSize: 13, color: 'var(--text-faint)', maxWidth: 280 }}>
        Send a chat message to start tracking token usage and costs.
      </div>
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────

export function UsageDashboard({ onClose }: Props) {
  const [stats,  setStats]  = useState<Stats | null>(null)
  const [logs,   setLogs]   = useState<LogRow[]>([])
  const [tools,  setTools]  = useState<ToolRow[]>([])
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [modelFilter, setFilter] = useState('all')
  const [loading, setLoading]    = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = modelFilter !== 'all' ? `?model=${encodeURIComponent(modelFilter)}` : ''
      const tq = modelFilter !== 'all' ? `?model=${encodeURIComponent(modelFilter)}` : ''
      const [sRes, lRes, tRes, skRes] = await Promise.all([
        fetch(`/api/usage${q}`),
        fetch(`/api/usage/logs${q}`),
        fetch(`/api/usage/tools${tq}`),
        fetch('/api/usage/skills'),
      ])
      setStats(await sRes.json())
      setLogs(await lRes.json())
      setTools(await tRes.json())
      setSkills(await skRes.json())
    } finally {
      setLoading(false)
    }
  }, [modelFilter])

  useEffect(() => { load() }, [load])

  const allModels = stats?.models.map(m => m.model) ?? []
  const t = stats?.totals

  const section: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border-sub)', borderRadius: 10, padding: '20px 24px',
  }

  return (
    <div style={{
      height: '100vh',
      background: 'var(--bg-app)',
      display: 'flex', flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: 'var(--text-primary)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 24px', borderBottom: '1px solid var(--border-faint)', background: 'var(--bg-surface)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 12px', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
          }}>
            ← Back
          </button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Token Usage</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>Cost & token tracking</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a
            href="/api/usage/export"
            download="usage_export.csv"
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '5px 12px', color: 'var(--text-secondary)', fontSize: 13,
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            ↓ CSV
          </a>

          <select
            value={modelFilter}
            onChange={e => setFilter(e.target.value)}
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '5px 10px', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="all">All Models</option>
            {allModels.map(m => <option key={m} value={m}>{shortModel(m)}</option>)}
          </select>

          <button onClick={load} disabled={loading} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 12px', color: loading ? 'var(--text-faint)' : 'var(--text-secondary)', fontSize: 13, cursor: loading ? 'default' : 'pointer',
          }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {loading && !stats ? (
          <div style={{ color: 'var(--text-faint)', textAlign: 'center', padding: 60, fontSize: 13 }}>Loading…</div>
        ) : !t || t.requests === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>

            {/* 1. Summary cards (6) */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <SummaryCard label="Total Spend"        value={fmtCost(t.total_cost)}          sub="lifetime"           accent />
              <SummaryCard label="Est. This Month"    value={t.projected_monthly != null ? fmtCost(t.projected_monthly) : '–'} sub="at current rate" />
              <SummaryCard label="Total Tokens"       value={fmtNum(t.total_tokens)}          sub={`${fmtNum(t.input_tokens)} in · ${fmtNum(t.output_tokens)} out`} />
              <SummaryCard label="Requests"           value={fmtNum(t.requests)}              sub="total calls" />
              <SummaryCard label="Avg Cost / Request" value={fmtCost(t.avg_cost)}             sub="per call" />
              <SummaryCard
                label="Avg Latency"
                value={fmtLatency(t.avg_latency_ms)}
                sub={t.p95_latency_ms != null ? `p95: ${fmtLatency(t.p95_latency_ms)}` : undefined}
              />
            </div>

            {/* 2. Daily chart */}
            {stats!.daily.length > 0 && (
              <div style={section}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 18, color: 'var(--text-secondary)' }}>Daily Activity</div>
                <DailyChart daily={stats!.daily} />
              </div>
            )}

            {/* 3. Latency by model */}
            {stats!.models.some(m => m.latency != null) && (
              <div style={section}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16, color: 'var(--text-secondary)' }}>Latency by Model</div>
                <LatencyTable models={stats!.models} />
              </div>
            )}

            {/* 4. Model breakdown */}
            {stats!.models.length > 0 && (
              <div style={section}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16, color: 'var(--text-secondary)' }}>By Model</div>
                <ModelBreakdown models={stats!.models} />
              </div>
            )}

            {/* 5. By Skill */}
            {skills.length > 0 && (
              <div style={section}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16, color: 'var(--text-secondary)' }}>By Skill</div>
                <SkillBreakdown skills={skills} />
              </div>
            )}

            {/* 6. MCP tool activity */}
            <div style={section}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>MCP Tool Activity</div>
                {tools.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {tools.reduce((s, t) => s + t.calls, 0)} total calls · {tools.length} unique tools
                  </div>
                )}
              </div>
              <ToolActivity tools={tools} />
            </div>

            {/* 7. Recent requests */}
            {logs.length > 0 && (
              <div style={section}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16, color: 'var(--text-secondary)' }}>Recent Requests</div>
                <LogTable logs={logs} avgCost={t.avg_cost} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
