import { useEffect, useRef } from 'react'
import type { Message } from '../../types'
import { MessageBubble } from './MessageBubble'

interface Props {
  messages: Message[]
  isLoading: boolean
}

export function ChatWindow({ messages, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '24px 20px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {messages.length === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-faint)',
          gap: 12,
        }}>
          <div style={{ fontSize: 32 }}>💬</div>
          <div style={{ fontSize: 15 }}>Ask anything to get started</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Try: "show me my campaigns" or "who am i?"
          </div>
        </div>
      )}

      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isLoading && messages[messages.length - 1]?.role === 'user' && (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, marginBottom: 12 }}>
          Thinking…
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
