export interface ToolCall {
  name: string
  args: Record<string, unknown>
  summary: string
  result?: string
}

export interface TraceReceipt {
  skill: string | null
  tools: ToolCall[]
  total_ms: number
  timestamp: string
}

export interface SkillBadge {
  name: string
}

export type WidgetType = 'candlestick' | 'line' | 'area' | 'bar' | 'gauge'

export interface Widget {
  widget_type: WidgetType
  title: string
  data: Record<string, unknown>[]
  x_key: string
  y_keys: string[]
  config: Record<string, unknown>
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  skills?: SkillBadge[]
  trace?: TraceReceipt
  widgets?: Widget[]
  isStreaming?: boolean
  error?: string
}

export interface Skill {
  name: string
  description: string
  status: 'active' | 'inactive' | 'beta'
  when_to_use: string
  body: string
  filename: string
}

export interface MCPServer {
  name: string
  type: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
}

export interface MCPTool {
  name: string
  description: string
}

export interface MCPHealth {
  status: 'ok' | 'error' | 'connecting' | 'loading'
  message?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}
