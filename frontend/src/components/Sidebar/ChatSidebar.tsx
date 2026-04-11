import { useState } from 'react'
import type { ChatSession } from '../../types'
import { SkillsPanel } from '../Skills/SkillsPanel'
import { MCPPanel } from '../MCP/MCPPanel'

type View = 'main' | 'skills' | 'mcp'

interface Props {
  isOpen: boolean
  onToggle: () => void
  sessions: ChatSession[]
  activeSessionId: string | null
  onNewChat: () => void
  onLoadSession: (session: ChatSession) => void
  onDeleteSession: (id: string) => void
  onShowUsage: () => void
}

function formatDate(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ChatSidebar({ isOpen, onToggle, sessions, activeSessionId, onNewChat, onLoadSession, onDeleteSession, onShowUsage }: Props) {
  const [view, setView] = useState<View>('main')

  const expandedWidth = view === 'main' ? 260 : 420
  const sidebarWidth = isOpen ? expandedWidth : 44

  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%',
    background: active ? 'var(--btn-bg)' : 'none',
    border: `1px solid ${active ? 'var(--btn-border)' : 'var(--border)'}`,
    borderRadius: 6,
    padding: '7px 12px',
    color: active ? 'var(--btn-text)' : 'var(--text-secondary)',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  })

  return (
    <div style={{
      width: sidebarWidth,
      minWidth: sidebarWidth,
      transition: 'width 0.2s ease, min-width 0.2s ease',
      overflow: 'hidden',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border-faint)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Always-visible 44px toggle strip */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, bottom: 0,
        width: 44,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 12,
        zIndex: 1,
      }}>
        <button
          onClick={onToggle}
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'color 0.15s, border-color 0.15s',
            flexShrink: 0,
          }}
        >
          {isOpen ? '◀' : '▶'}
        </button>
      </div>

      {/* Expanded content */}
      <div style={{
        marginLeft: 44,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.15s ease',
        pointerEvents: isOpen ? 'auto' : 'none',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        {view === 'main' ? (
          <>
            {/* New Chat button */}
            <div style={{ padding: '12px 10px 8px 10px', flexShrink: 0 }}>
              <button
                onClick={() => { onNewChat() }}
                style={{
                  width: '100%',
                  background: 'var(--btn-bg)',
                  border: '1px solid var(--btn-border)',
                  borderRadius: 6,
                  padding: '7px 12px',
                  color: 'var(--btn-text)',
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                + New Chat
              </button>
            </div>

            {/* Session list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px' }}>
              {sessions.length === 0 ? (
                <div style={{ color: 'var(--text-faint)', fontSize: 12, textAlign: 'center', padding: '24px 8px' }}>
                  No previous chats
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sessions.map(s => {
                    const isActive = s.id === activeSessionId
                    return (
                      <div
                        key={s.id}
                        style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}
                        className="session-card"
                      >
                        <button
                          onClick={() => onLoadSession(s)}
                          style={{
                            flex: 1,
                            background: isActive ? 'var(--btn-bg)' : 'transparent',
                            border: `1px solid ${isActive ? 'var(--btn-border)' : 'transparent'}`,
                            borderRadius: 6,
                            padding: '8px 30px 8px 10px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 0.15s',
                            minWidth: 0,
                          }}
                        >
                          <div style={{
                            fontSize: 13,
                            color: isActive ? 'var(--btn-text)' : 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {s.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {formatDate(s.updatedAt)}
                          </div>
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onDeleteSession(s.id) }}
                          title="Delete chat"
                          style={{
                            position: 'absolute',
                            right: 4,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-faint)',
                            fontSize: 13,
                            cursor: 'pointer',
                            padding: '2px 4px',
                            lineHeight: 1,
                            borderRadius: 3,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Bottom nav */}
            <div style={{
              borderTop: '1px solid var(--border-faint)',
              padding: '10px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              flexShrink: 0,
            }}>
              <button onClick={() => setView('mcp')} style={navBtnStyle(false)}>
                MCP Connectors
              </button>
              <button onClick={() => setView('skills')} style={navBtnStyle(false)}>
                Skills
              </button>
              <button onClick={onShowUsage} style={navBtnStyle(false)}>
                Token Usage
              </button>
            </div>
          </>
        ) : view === 'mcp' ? (
          <MCPPanel onClose={() => setView('main')} />
        ) : (
          <SkillsPanel onClose={() => setView('main')} />
        )}
      </div>
    </div>
  )
}
