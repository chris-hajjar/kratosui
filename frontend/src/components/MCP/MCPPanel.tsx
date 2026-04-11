import { useEffect, useState } from 'react'
import type { MCPServer, MCPTool, MCPHealth } from '../../types'

interface Props {
  onClose: () => void
}

type FormType = 'stdio' | 'sse'

const EMPTY_FORM = { name: '', filePath: '', url: '', headerKey: '', headerVal: '' }

function inferCommand(filePath: string): { command: string; args: string[] } {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'py') return { command: 'python', args: [filePath] }
  if (ext === 'js' || ext === 'mjs') return { command: 'node', args: [filePath] }
  if (ext === 'ts') return { command: 'npx', args: ['tsx', filePath] }
  // Binary / .mcpb / no extension — run directly
  return { command: filePath, args: [] }
}

export function MCPPanel({ onClose }: Props) {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [health, setHealth] = useState<Record<string, MCPHealth>>({})
  const [tools, setTools] = useState<Record<string, MCPTool[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [formType, setFormType] = useState<FormType>('stdio')
  const [form, setForm] = useState(EMPTY_FORM)
  const [extraHeaders, setExtraHeaders] = useState<{ k: string; v: string }[]>([])
  const [note, setNote] = useState('')

  const fetchServers = async () => {
    setLoading(true)
    try {
      const [serversRes, statusRes] = await Promise.all([
        fetch('/api/mcp').then(r => r.json()),
        fetch('/api/mcp/status').then(r => r.json()),
      ])
      setServers(serversRes)
      const h: Record<string, MCPHealth> = {}
      for (const s of serversRes) {
        h[s.name] = statusRes[s.name] ?? { status: 'loading' }
      }
      setHealth(h)
    } finally {
      setLoading(false)
    }
  }

  const fetchTools = async (name: string) => {
    if (tools[name]) return
    const data: MCPTool[] = await fetch(`/api/mcp/${name}/tools`).then(r => r.json())
    setTools(t => ({ ...t, [name]: data }))
  }

  const toggleExpand = (name: string) => {
    if (expanded === name) {
      setExpanded(null)
    } else {
      setExpanded(name)
      fetchTools(name)
    }
  }

  useEffect(() => { fetchServers() }, [])

  const handleBrowse = async () => {
    const res = await fetch('/api/browse').then(r => r.json())
    if (res.path) setForm(f => ({ ...f, filePath: res.path }))
  }

  const handleAdd = async () => {
    const headers: Record<string, string> = {}
    if (form.headerKey && form.headerVal) headers[form.headerKey] = form.headerVal
    for (const { k, v } of extraHeaders) if (k && v) headers[k] = v

    const { command, args } = formType === 'stdio' ? inferCommand(form.filePath) : { command: '', args: [] }
    const payload = {
      name: form.name.trim(),
      type: formType,
      command,
      args,
      url: form.url.trim(),
      headers,
    }
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setNote(data.note ?? '')
    setForm(EMPTY_FORM)
    setExtraHeaders([])
    setAdding(false)
    fetchServers()
  }

  const handleDelete = async (name: string) => {
    await fetch(`/api/mcp/${name}`, { method: 'DELETE' })
    fetchServers()
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: 13,
    width: '100%',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border-sub)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>MCP Servers</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Tool sources available to the AI
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 20, cursor: 'pointer',
        }}>×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {note && (
          <div style={{
            background: '#1a1a00', border: '1px solid #3a3a00',
            borderRadius: 6, padding: '8px 12px', fontSize: 12,
            color: '#fbbf24', marginBottom: 12,
          }}>
            ⚠ {note}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {servers.map(s => {
              const h = health[s.name]
              const isExpanded = expanded === s.name
              const serverTools = tools[s.name]

              return (
                <div key={s.name} style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-sub)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}>
                  {/* Card header row */}
                  <div
                    onClick={() => toggleExpand(s.name)}
                    style={{
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    {/* Health dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: !h ? '#555'
                        : h.status === 'ok' ? '#22c55e'
                        : h.status === 'error' ? '#ef4444'
                        : '#555',
                    }} />

                    {/* Name + type badge */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                          {s.name}
                        </span>
                        <span style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 20,
                          border: '1px solid var(--border)',
                          color: 'var(--text-muted)',
                          letterSpacing: '0.04em',
                        }}>
                          {s.type === 'sse' ? 'Remote' : 'Local'}
                        </span>
                      </div>
                      <div style={{
                        fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', marginTop: 3,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {s.type === 'sse' ? s.url : `${s.command} ${(s.args ?? []).join(' ')}`}
                      </div>
                    </div>

                    {/* Chevron */}
                    <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                      {isExpanded ? '▾' : '▸'}
                    </span>

                    {/* Remove */}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(s.name) }}
                      style={{
                        background: 'none', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '3px 8px',
                        color: '#ef4444', fontSize: 11, cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  {/* Expanded: tool list */}
                  {isExpanded && (
                    <div style={{
                      borderTop: '1px solid var(--border-sub)',
                      padding: '10px 14px 12px',
                    }}>
                      {h?.status === 'error' ? (
                        <div style={{ fontSize: 12, color: '#ef4444' }}>
                          Error: {h.message ?? 'Server failed to connect'}
                        </div>
                      ) : !serverTools ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading tools…</div>
                      ) : serverTools.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>No tools registered</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                            {serverTools.length} tool{serverTools.length !== 1 ? 's' : ''}
                          </div>
                          {serverTools.map(t => (
                            <div key={t.name} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#60a5fa' }}>
                                {t.name}
                              </span>
                              {t.description && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 2 }}>
                                  {t.description}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Add form */}
        {adding && (
          <div style={{
            marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--border-sub)',
            borderRadius: 8, padding: '14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
              Add MCP server
            </div>

            {/* Type toggle */}
            <div style={{ display: 'flex', gap: 6 }}>
              {(['stdio', 'sse'] as FormType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setFormType(t)}
                  style={{
                    padding: '5px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                    background: formType === t ? 'var(--btn-bg)' : 'var(--bg-input)',
                    border: `1px solid ${formType === t ? 'var(--btn-border)' : 'var(--border)'}`,
                    color: formType === t ? 'var(--btn-text)' : 'var(--text-secondary)',
                  }}
                >
                  {t === 'stdio' ? 'Local' : 'Remote (SSE)'}
                </button>
              ))}
            </div>

            {/* Name */}
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Name</div>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={inputStyle} placeholder="my-server" />
            </div>

            {formType === 'stdio' ? (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Server file</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{
                    flex: 1, fontFamily: 'monospace', fontSize: 12,
                    color: form.filePath ? 'var(--text-primary)' : 'var(--text-faint)',
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '8px 12px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {form.filePath || 'No file selected'}
                  </div>
                  <button
                    onClick={handleBrowse}
                    style={{
                      background: 'var(--btn-bg)', border: '1px solid var(--btn-border)',
                      borderRadius: 6, padding: '8px 14px',
                      color: 'var(--btn-text)', fontSize: 13, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    Choose file
                  </button>
                </div>
                {form.filePath && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                    Will run as: <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {(() => { const { command, args } = inferCommand(form.filePath); return [command, ...args].join(' ') })()}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Server URL</div>
                  <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    style={inputStyle} placeholder="https://example.com/mcp/sse" />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Headers <span style={{ color: 'var(--text-faint)' }}>(optional — for API keys, auth tokens)</span>
                  </div>
                  {/* First header row */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input value={form.headerKey} onChange={e => setForm(f => ({ ...f, headerKey: e.target.value }))}
                      style={{ ...inputStyle, flex: 1 }} placeholder="Authorization" />
                    <input value={form.headerVal} onChange={e => setForm(f => ({ ...f, headerVal: e.target.value }))}
                      style={{ ...inputStyle, flex: 2 }} placeholder="Bearer sk-..." />
                  </div>
                  {/* Extra header rows */}
                  {extraHeaders.map((h, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input value={h.k} onChange={e => setExtraHeaders(rows => rows.map((r, j) => j === i ? { ...r, k: e.target.value } : r))}
                        style={{ ...inputStyle, flex: 1 }} placeholder="Key" />
                      <input value={h.v} onChange={e => setExtraHeaders(rows => rows.map((r, j) => j === i ? { ...r, v: e.target.value } : r))}
                        style={{ ...inputStyle, flex: 2 }} placeholder="Value" />
                      <button onClick={() => setExtraHeaders(rows => rows.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => setExtraHeaders(r => [...r, { k: '', v: '' }])}
                    style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    + Add header
                  </button>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setAdding(false); setForm(EMPTY_FORM); setExtraHeaders([]) }} style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                padding: '8px 14px', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              }}>Cancel</button>
              <button
                onClick={handleAdd}
                disabled={!form.name || (formType === 'stdio' ? !form.filePath : !form.url)}
                style={{
                  background: (form.name && (formType === 'stdio' ? form.filePath : form.url)) ? '#3b82f6' : 'var(--bg-input)',
                  border: 'none', borderRadius: 6, padding: '8px 14px',
                  color: '#fff', fontSize: 13,
                  cursor: (form.name && (formType === 'stdio' ? form.filePath : form.url)) ? 'pointer' : 'default',
                }}
              >
                Add server
              </button>
            </div>
          </div>
        )}
      </div>

      {!adding && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-sub)', flexShrink: 0 }}>
          <button
            onClick={() => { setAdding(true); setNote('') }}
            style={{
              width: '100%', background: 'var(--btn-bg)', border: '1px solid var(--btn-border)',
              borderRadius: 8, padding: '10px', color: 'var(--btn-text)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            + Add MCP server
          </button>
        </div>
      )}
    </div>
  )
}
