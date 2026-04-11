import { useState } from 'react'
import type { ToolCall, TraceReceipt } from '../../types'

interface Props {
  trace: TraceReceipt
}

export function TracePanel({ trace }: Props) {
  if (trace.tools.length === 0) return null
  const multi = trace.tools.length > 1

  return (
    <div style={{ marginTop: 8, position: 'relative', paddingLeft: multi ? 16 : 0 }}>
      {/* Vertical connecting line */}
      {multi && (
        <div style={{
          position: 'absolute',
          left: 4,
          top: 6,
          bottom: 6,
          width: 1,
          background: 'var(--border-sub)',
        }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {trace.tools.map((t, i) => (
          <ToolRow key={i} tool={t} showDot={multi} />
        ))}
      </div>
    </div>
  )
}

function ToolRow({ tool, showDot }: { tool: ToolCall; showDot?: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      {/* Dot anchored to the badge, not the whole (possibly expanded) row */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {showDot && (
          <div style={{
            position: 'absolute',
            left: -16,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--bg-code)',
            border: '1.5px solid var(--border)',
          }} />
        )}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '5px 10px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'inline-block',
            letterSpacing: '0.02em',
          }}
        >
          Result
        </button>
      </div>

      {open && (
        <div style={{
          marginTop: 6,
          background: 'var(--bg-code)',
          border: '1px solid var(--border-sub)',
          borderRadius: 6,
          overflow: 'hidden',
          fontFamily: 'monospace',
          fontSize: 12,
        }}>
          <div style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border-sub)',
            color: '#60a5fa',
            fontSize: 12,
          }}>
            {tool.name}
          </div>

          <JsonSection label="Request" value={tool.args} />
          <JsonSection label="Response" raw={tool.result} allowTable />
        </div>
      )}
    </div>
  )
}

function isTabular(val: unknown): val is Record<string, unknown>[] {
  return (
    Array.isArray(val) &&
    val.length > 0 &&
    typeof val[0] === 'object' &&
    val[0] !== null &&
    !Array.isArray(val[0])
  )
}

function JsonSection({ label, value, raw, allowTable }: {
  label: string
  value?: unknown
  raw?: string
  allowTable?: boolean
}) {
  let parsed: unknown
  if (value !== undefined) {
    parsed = value
  } else if (raw !== undefined) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }

  const showTable = allowTable && isTabular(parsed)

  const formatted =
    !showTable && parsed !== null && parsed !== undefined
      ? JSON.stringify(parsed, null, 2)
      : (raw ?? '')

  return (
    <div style={{ borderBottom: '1px solid var(--border-sub)' }}>
      <div style={{
        padding: '6px 14px 2px',
        fontSize: 11,
        color: 'var(--text-muted)',
        letterSpacing: '0.05em',
      }}>
        {label}
      </div>
      {showTable ? (
        <div style={{ padding: '6px 14px 10px', overflowX: 'auto' }}>
          <DataTable rows={parsed as Record<string, unknown>[]} />
        </div>
      ) : (
        <pre style={{
          margin: 0,
          padding: '6px 14px 10px',
          overflowX: 'auto',
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
        }}>
          <JsonHighlight text={formatted} />
        </pre>
      )}
    </div>
  )
}

function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))))

  const cellVal = (v: unknown) => {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  return (
    <table style={{
      borderCollapse: 'collapse',
      fontSize: 11,
      width: '100%',
      fontFamily: 'monospace',
    }}>
      <thead>
        <tr>
          {cols.map(col => (
            <th key={col} style={{
              padding: '4px 10px 4px 0',
              textAlign: 'left',
              color: 'var(--text-muted)',
              fontWeight: 600,
              borderBottom: '1px solid var(--border-sub)',
              whiteSpace: 'nowrap',
            }}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {cols.map(col => (
              <td key={col} style={{
                padding: '4px 10px 4px 0',
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-sub)',
                whiteSpace: 'nowrap',
                maxWidth: 240,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {cellVal(row[col])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function JsonHighlight({ text }: { text: string }) {
  const tokens = tokenize(text)
  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} style={{ color: tok.color }}>{tok.text}</span>
      ))}
    </>
  )
}

type Token = { text: string; color: string }

const KEY_COLOR    = '#f87171'  // red   — keys
const STR_COLOR    = '#86efac'  // green — string values
const NUM_COLOR    = '#7dd3fc'  // blue  — numbers, booleans, null
const PUNCT_COLOR  = '#555555'  // gray  — punctuation
const DEFAULT_COLOR = '#888888' // fallback

function tokenize(json: string): Token[] {
  const tokens: Token[] = []
  // Regex: key, string value, number, keyword, punctuation, whitespace
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)|([\[\]{},])|(\n|\r\n|\r)|( +)/g
  let match: RegExpExecArray | null
  let last = 0

  while ((match = re.exec(json)) !== null) {
    if (match.index > last) {
      tokens.push({ text: json.slice(last, match.index), color: DEFAULT_COLOR })
    }

    if (match[1] !== undefined) {
      // String — check if followed by colon (= key)
      if (match[2] !== undefined) {
        tokens.push({ text: match[1], color: KEY_COLOR })
        tokens.push({ text: match[2], color: PUNCT_COLOR })
      } else {
        tokens.push({ text: match[1], color: STR_COLOR })
      }
    } else if (match[3] !== undefined) {
      tokens.push({ text: match[3], color: NUM_COLOR })
    } else if (match[4] !== undefined) {
      tokens.push({ text: match[4], color: NUM_COLOR })
    } else if (match[5] !== undefined) {
      tokens.push({ text: match[5], color: PUNCT_COLOR })
    } else {
      // whitespace/newline — preserve as-is
      tokens.push({ text: match[0], color: DEFAULT_COLOR })
    }

    last = match.index + match[0].length
  }

  if (last < json.length) {
    tokens.push({ text: json.slice(last), color: DEFAULT_COLOR })
  }

  return tokens
}
