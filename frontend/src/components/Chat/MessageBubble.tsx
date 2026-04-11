import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../../types'
import { TracePanel } from './TracePanel'

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{
          background: 'var(--btn-bg)',
          borderRadius: '12px 12px 2px 12px',
          padding: '10px 14px',
          maxWidth: '70%',
          color: 'var(--btn-text)',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Attribution badge */}
      {message.skill && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{
            background: '#1a1a2e',
            border: '1px solid #7c3aed',
            borderRadius: 20,
            padding: '2px 10px',
            fontSize: 11,
            color: '#a78bfa',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            {message.skill.icon} via {message.skill.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{message.skill.category}</span>
        </div>
      )}

      {/* Message body */}
      <div style={{
        color: 'var(--text-primary)',
        fontSize: 14,
        lineHeight: 1.7,
      }}>
        {message.error ? (
          <div style={{
            background: '#2a1010',
            border: '1px solid #7f1d1d',
            borderRadius: 6,
            padding: '10px 14px',
            color: '#fca5a5',
            fontSize: 13,
          }}>
            {message.error}
          </div>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div style={{ overflowX: 'auto', marginTop: 8, marginBottom: 8 }}>
                  <table style={{
                    borderCollapse: 'collapse',
                    fontSize: 13,
                    width: '100%',
                  }}>{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th style={{
                  border: '1px solid var(--border)',
                  padding: '6px 12px',
                  background: 'var(--bg-input)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  textAlign: 'left',
                }}>{children}</th>
              ),
              td: ({ children }) => (
                <td style={{
                  border: '1px solid var(--border-faint)',
                  padding: '6px 12px',
                  color: 'var(--text-primary)',
                }}>{children}</td>
              ),
              code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) =>
                inline ? (
                  <code style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    padding: '1px 5px',
                    fontSize: 12,
                    color: '#7dd3fc',
                    fontFamily: 'monospace',
                    display: 'inline',
                    whiteSpace: 'nowrap',
                  }} {...props}>{children}</code>
                ) : (
                  <pre style={{
                    background: 'var(--bg-code)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: 12,
                    overflowX: 'auto',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                  }}>
                    <code {...props}>{children}</code>
                  </pre>
                ),
            }}
          >
            {message.content || (message.isStreaming ? '▋' : '')}
          </ReactMarkdown>
        )}
      </div>

      {/* Trace panel */}
      {message.trace && <TracePanel trace={message.trace} />}
    </div>
  )
}
