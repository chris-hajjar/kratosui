import { useState } from 'react'
import { useChat } from './hooks/useChat'
import { useTheme } from './hooks/useTheme'
import { ChatWindow } from './components/Chat/ChatWindow'
import { ChatInput } from './components/Chat/ChatInput'
import { ChatSidebar } from './components/Sidebar/ChatSidebar'
import { UsageDashboard } from './components/Usage/UsageDashboard'

export default function App() {
  const { messages, isLoading, sendMessage, sessions, activeSessionId, newChat, loadSession, deleteSession } = useChat()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showUsage, setShowUsage] = useState(false)
  const { theme, toggle } = useTheme()

  if (showUsage) {
    return <UsageDashboard onClose={() => setShowUsage(false)} />
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      height: '100vh',
      background: 'var(--bg-app)',
      color: 'var(--text-primary)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <ChatSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewChat={newChat}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
        onShowUsage={() => setShowUsage(true)}
      />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-faint)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 20 }}>💬</span>
            <span style={{ fontWeight: 600, fontSize: 16, marginLeft: 10 }}>Kratos UI</span>
          </div>
          <button
            onClick={toggle}
            title="Toggle theme"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 10px',
              color: 'var(--text-secondary)',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ChatWindow messages={messages} isLoading={isLoading} />
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      </div>
    </div>
  )
}
