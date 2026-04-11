import { useState, useRef, useCallback, useEffect } from 'react'
import type { Message, TraceReceipt, SkillBadge, ChatSession } from '../types'

function uid() {
  return Math.random().toString(36).slice(2)
}

const STORAGE_KEY = 'kratos_ui_sessions'

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChatSession[]) : []
  } catch { return [] }
}

function saveSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch (e) {
    console.warn('kratos-ui: localStorage quota exceeded', e)
  }
}

function generateTitle(messages: Message[]): string {
  const first = messages.find(m => m.role === 'user')
  if (!first) return 'New Chat'
  const words = first.content.trim().split(/\s+/)
  if (words.length <= 10) return words.join(' ')
  return words.slice(0, 10).join(' ') + '…'
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const loadingSessionRef = useRef(false)

  // Auto-save sessions to localStorage.
  // Creates the session entry immediately on first user message (so it appears in the list right away),
  // then skips streaming deltas and does a final save once the stream finishes.
  useEffect(() => {
    if (messages.length === 0) return
    // Messages were just restored from history — don't update updatedAt or re-sort
    if (loadingSessionRef.current) {
      loadingSessionRef.current = false
      return
    }
    const isStreaming = messages.some(m => m.isStreaming)
    const sessionExists = activeSessionIdRef.current !== null
    // Skip streaming updates once the session is already created
    if (isStreaming && sessionExists) return

    const now = new Date().toISOString()
    const title = generateTitle(messages)

    // Resolve session ID synchronously before calling setSessions,
    // so we don't rely on mutations inside the updater running immediately.
    let sessionId = activeSessionIdRef.current
    if (sessionId === null) {
      sessionId = uid()
      activeSessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
    }

    const id = sessionId
    setSessions(prev => {
      const exists = prev.some(s => s.id === id)
      const updated = exists
        ? prev.map(s => s.id === id ? { ...s, title, messages, updatedAt: now } : s)
        : [{ id, title, messages, createdAt: now, updatedAt: now }, ...prev]
      const sorted = updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      saveSessions(sorted)
      return sorted
    })
  }, [messages])

  const sendMessage = useCallback(async (text: string, model: string = "openai:gpt-4o") => {
    if (!text.trim() || isLoading) return

    // Add user message
    const userMsg: Message = { id: uid(), role: 'user', content: text }
    const assistantId = uid()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setIsLoading(true)

    // Build history from current messages (before adding new ones)
    const history = messages.map(m => ({ role: m.role, content: m.content }))

    abortRef.current = new AbortController()

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, model }),
        signal: abortRef.current.signal,
      })

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const patch = (updater: (m: Message) => Message) => {
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? updater(m) : m))
        )
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        buffer = buffer.replace(/\r\n/g, '\n')

        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw) continue

          let evt: Record<string, unknown>
          try { evt = JSON.parse(raw) } catch { continue }

          switch (evt.type) {
            case 'skill_activated':
              patch(m => ({
                ...m,
                skill: {
                  name: evt.name as string,
                  icon: evt.icon as string,
                  category: evt.category as string,
                } satisfies SkillBadge,
              }))
              break

            case 'text_delta':
              patch(m => ({ ...m, content: m.content + (evt.content as string) }))
              break

            case 'trace':
              patch(m => ({
                ...m,
                trace: {
                  skill: evt.skill as string | null,
                  tools: (evt.tools as TraceReceipt['tools']) ?? [],
                  total_ms: evt.total_ms as number,
                  timestamp: evt.timestamp as string,
                } satisfies TraceReceipt,
              }))
              break

            case 'error':
              patch(m => ({
                ...m,
                error: evt.message as string,
                isStreaming: false,
              }))
              break

            case 'done':
              patch(m => ({ ...m, isStreaming: false }))
              break
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, error: String(err), isStreaming: false }
              : m
          )
        )
      }
    } finally {
      setIsLoading(false)
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId && m.isStreaming ? { ...m, isStreaming: false } : m
        )
      )
    }
  }, [messages, isLoading])

  const clearMessages = useCallback(() => setMessages([]), [])

  const newChat = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setIsLoading(false)
    activeSessionIdRef.current = null
    setActiveSessionId(null)
  }, [])

  const loadSession = useCallback((session: ChatSession) => {
    abortRef.current?.abort()
    loadingSessionRef.current = true
    const sanitized = session.messages.map(m => m.isStreaming ? { ...m, isStreaming: false } : m)
    setMessages(sanitized)
    setIsLoading(false)
    activeSessionIdRef.current = session.id
    setActiveSessionId(session.id)
  }, [])

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      saveSessions(next)
      return next
    })
    if (activeSessionIdRef.current === id) {
      activeSessionIdRef.current = null
      setActiveSessionId(null)
      setMessages([])
    }
  }, [])

  return { messages, isLoading, sendMessage, clearMessages, sessions, activeSessionId, newChat, loadSession, deleteSession }
}
