import { useState } from 'react'
import type { Skill } from '../../types'

interface Props {
  skill: Skill | null
  onSave: (data: Omit<Skill, 'filename'>, filename: string) => void
  onCancel: () => void
}

const CATEGORIES = ['Analytics', 'Content', 'Research', 'Operations', 'General']

export function SkillEditor({ skill, onSave, onCancel }: Props) {
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [category, setCategory] = useState(skill?.category ?? 'General')
  const [icon, setIcon] = useState(skill?.icon ?? '🔧')
  const [status, setStatus] = useState<'active' | 'inactive' | 'beta'>(
    (skill?.status as 'active' | 'inactive' | 'beta') ?? 'active'
  )
  const [triggers, setTriggers] = useState<string[]>(skill?.triggers ?? [])
  const [triggerInput, setTriggerInput] = useState('')
  const [body, setBody] = useState(skill?.body ?? '')

  const addTrigger = () => {
    const t = triggerInput.trim()
    if (t && !triggers.includes(t)) setTriggers(prev => [...prev, t])
    setTriggerInput('')
  }

  const removeTrigger = (t: string) => setTriggers(prev => prev.filter(x => x !== t))

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ name, description, category, icon, status, triggers, body }, skill?.filename ?? '')
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
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: '0 0 60px' }}>
          <label style={labelStyle}>Icon</label>
          <input
            value={icon}
            onChange={e => setIcon(e.target.value)}
            style={{ ...inputStyle, textAlign: 'center', fontSize: 20 }}
            maxLength={4}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="My Skill" />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="What does this skill do?" />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
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
      </div>

      <div>
        <label style={labelStyle}>Trigger phrases — when these appear in a message, this skill activates</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            value={triggerInput}
            onChange={e => setTriggerInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTrigger() } }}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="e.g. campaign, show me"
          />
          <button onClick={addTrigger} style={{
            background: 'var(--btn-bg)', border: '1px solid var(--btn-border)', borderRadius: 6,
            padding: '6px 12px', color: 'var(--btn-text)', fontSize: 12, cursor: 'pointer',
          }}>+ Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {triggers.map(t => (
            <span key={t} style={{
              background: '#1a1a2e', border: '1px solid #3b0764',
              borderRadius: 20, padding: '2px 10px', fontSize: 12, color: '#a78bfa',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t}
              <button onClick={() => removeTrigger(t)} style={{
                background: 'none', border: 'none', color: '#7c3aed',
                cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1,
              }}>×</button>
            </span>
          ))}
        </div>
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
