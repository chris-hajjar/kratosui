import { useEffect, useState, useCallback } from 'react'

interface DailyRow   { day: string; requests: number; total_tokens: number; cost: number }
interface ModelRow   { model: string; requests: number; total_tokens: number; cost: number }
interface LogRow     { id: number; timestamp: number; model: string; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number; skill_name: string | null; duration_ms: number | null }
interface ToolRow    { tool_name: string; calls: number; unique_requests: number; last_used: number; skills: string | null }
interface Stats {
  totals: { requests: number; input_tokens: number; output_tokens: number; total_tokens: number; total_cost: number; avg_cost: number }
  daily:  DailyRow[]
  models: ModelRow[]
}

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

function shortModel(m: string): string {
  return m.replace('openai:', '').replace('anthropic:', '')
}

function shortDate(day: string): string {
  return new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

function DailyChart({ daily }: { daily: DailyRow[] }) {
  const data = daily.slice(-14)
  const maxCost = Math.max(...data.map(d => d.cost), 0.0001)
  const BAR_H = 140

  if (data.length === 0) return <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No data yet</div>

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: BAR_H + 28 }}>
      {data.map(d => {
        const h = Math.max(3, (d.cost / maxCost) * BAR_H)
        return (
          <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div
              title={`${shortDate(d.day)}\n${fmtCost(d.cost)} · ${fmtNum(d.total_tokens)} tokens · ${d.requests} req`}
              style={{
                width: '100%', height: h,
                background: 'linear-gradient(to top, #16a34a, #4ade80)',
                borderRadius: '3px 3px 0 0',
              }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{shortDate(d.day)}</div>
          </div>
        )
      })}
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

function LogTable({ logs }: { logs: LogRow[] }) {
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
          {logs.map(log => (
            <tr key={log.id} style={{ borderBottom: '1px solid var(--border-faint)' }}>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{fmtTime(log.timestamp)}</td>
              <td style={{ ...td, color: 'var(--text-primary)' }}>{shortModel(log.model)}</td>
              <td style={{ ...td, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{fmtNum(log.input_tokens)}</td>
              <td style={{ ...td, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{fmtNum(log.output_tokens)}</td>
              <td style={{ ...td, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{fmtNum(log.total_tokens)}</td>
              <td style={{ ...td, color: '#4ade80' }}>{fmtCost(log.cost_usd)}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{log.skill_name ?? '–'}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{log.duration_ms != null ? `${log.duration_ms}ms` : '–'}</td>
            </tr>
          ))}
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
        const skillList = t.skills ? t.skills.split(',').filter(Boolean).join(', ') : null
        return (
          <div key={t.tool_name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{t.tool_name}</span>
                {skillList && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>via {skillList}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 18 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.unique_requests} req</span>
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
  const [stats, setStats]        = useState<Stats | null>(null)
  const [logs,  setLogs]         = useState<LogRow[]>([])
  const [tools, setTools]        = useState<ToolRow[]>([])
  const [modelFilter, setFilter] = useState('all')
  const [loading, setLoading]    = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = modelFilter !== 'all' ? `?model=${encodeURIComponent(modelFilter)}` : ''
      const [sRes, lRes, tRes] = await Promise.all([
        fetch(`/api/usage${q}`),
        fetch(`/api/usage/logs${q}`),
        fetch('/api/usage/tools'),
      ])
      setStats(await sRes.json())
      setLogs(await lRes.json())
      setTools(await tRes.json())
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

            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <SummaryCard label="Total Spend"        value={fmtCost(t.total_cost)}   sub="lifetime"           accent />
              <SummaryCard label="Total Tokens"       value={fmtNum(t.total_tokens)}  sub={`${fmtNum(t.input_tokens)} in · ${fmtNum(t.output_tokens)} out`} />
              <SummaryCard label="Requests"           value={fmtNum(t.requests)}      sub="total calls" />
              <SummaryCard label="Avg Cost / Request" value={fmtCost(t.avg_cost)}     sub="per call" />
            </div>

            {/* Daily chart */}
            {stats!.daily.length > 0 && (
              <div style={section}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 18, color: 'var(--text-secondary)' }}>Daily Spend</div>
                <DailyChart daily={stats!.daily} />
              </div>
            )}

            {/* Model breakdown */}
            {stats!.models.length > 0 && (
              <div style={section}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16, color: 'var(--text-secondary)' }}>By Model</div>
                <ModelBreakdown models={stats!.models} />
              </div>
            )}

            {/* MCP tool activity */}
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

            {/* Recent requests */}
            {logs.length > 0 && (
              <div style={section}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16, color: 'var(--text-secondary)' }}>Recent Requests</div>
                <LogTable logs={logs} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
