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
  icon: string
  category: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  skills?: SkillBadge[]
  trace?: TraceReceipt
  isStreaming?: boolean
  error?: string
}

export interface Skill {
  name: string
  description: string
  category: string
  icon: string
  status: 'active' | 'inactive' | 'beta'
  triggers: string[]
  body: string
  filename: string
  persist?: boolean
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
  persistedSkills: string[]
  createdAt: string
  updatedAt: string
}
