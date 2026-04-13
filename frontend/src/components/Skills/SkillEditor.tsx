import { useState } from 'react'
import type { Skill } from '../../types'

interface Props {
  skill: Skill | null
  onSave: (data: Omit<Skill, 'filename'>, filename: string) => void
  onCancel: () => void
}

export function SkillEditor({ skill, onSave, onCancel }: Props) {
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [whenToUse, setWhenToUse] = useState(skill?.when_to_use ?? '')
  const [status, setStatus] = useState<'active' | 'inactive' | 'beta'>(
    (skill?.status as 'active' | 'inactive' | 'beta') ?? 'active'
  )
  const [body, setBody] = useState(skill?.body ?? '')

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ name, description, when_to_use: whenToUse, status, body }, skill?.filename ?? '')
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

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginBottom: 4,
    display: 'block',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 2px' }}>
      <div>
        <label style={labelStyle}>Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="My Skill" />
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="What does this skill do?" />
      </div>

      <div>
        <label style={labelStyle}>Status</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value as 'active' | 'inactive' | 'beta')}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="active">Active</option>
          <option value="beta">Beta</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div>
        <label style={labelStyle}>When should the AI use this?</label>
        <input
          value={whenToUse}
          onChange={e => setWhenToUse(e.target.value)}
          style={inputStyle}
          placeholder="e.g. user asks for stock prices or market data"
        />
      </div>

      <div>
        <label style={labelStyle}>Skill prompt — injected into the AI when this skill is triggered</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={8}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          placeholder="Describe what the AI should do when this skill is active. E.g. 'Always call whoami first. Present data as markdown tables.'"
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 6,
          padding: '8px 16px', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
        }}>Cancel</button>
        <button onClick={handleSave} disabled={!name.trim()} style={{
          background: name.trim() ? '#3b82f6' : 'var(--bg-input)',
          border: 'none', borderRadius: 6, padding: '8px 16px',
          color: '#fff', fontSize: 13, cursor: name.trim() ? 'pointer' : 'default',
        }}>Save skill</button>
      </div>
    </div>
  )
}
