import { useState, useRef, useEffect } from 'react'
import type { KeyboardEvent } from 'react'

const MODELS = [
  { id: 'openai:gpt-4o',      label: 'GPT-4o' },
  { id: 'openai:gpt-4-turbo', label: 'GPT-4 Turbo' },
  { id: 'openai:gpt-4o-mini', label: 'GPT-4o mini' },
]

interface Props {
  onSend: (text: string, model: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id)
  const [showMenu, setShowMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedLabel = MODELS.find(m => m.id === selectedModel)?.label ?? 'GPT-4o'

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed, selectedModel)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const onInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <div style={{
      borderTop: '1px solid var(--border-faint)',
      padding: '12px 16px',
      background: 'var(--bg-surface)',
    }}>
      <div style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onInput={onInput}
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
          disabled={disabled}
          rows={1}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '12px 14px 8px 14px',
            color: 'var(--text-bright)',
            fontSize: 14,
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            overflowY: 'hidden',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />

        {/* Bottom bar: model selector + send */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px 8px 10px',
        }}>
          <div />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Model selector pill */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMenu(v => !v)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedLabel}
                <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
              </button>

              {showMenu && (
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  right: 0,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  zIndex: 50,
                  minWidth: 140,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}>
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setShowMenu(false) }}
                      style={{
                        width: '100%',
                        background: m.id === selectedModel ? 'var(--btn-bg)' : 'none',
                        border: 'none',
                        padding: '9px 14px',
                        color: m.id === selectedModel ? 'var(--btn-text)' : 'var(--text-primary)',
                        fontSize: 13,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'block',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Send button */}
            <button
              onClick={submit}
              disabled={disabled || !value.trim()}
              style={{
                background: disabled || !value.trim() ? 'var(--border)' : '#3b82f6',
                border: 'none',
                borderRadius: 6,
                padding: '5px 16px',
                color: '#fff',
                fontSize: 13,
                cursor: disabled || !value.trim() ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s',
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
