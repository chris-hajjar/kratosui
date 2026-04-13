import { useEffect, useRef, useState } from 'react'
import type { Skill } from '../../types'
import { useSkills } from '../../hooks/useSkills'
import { SkillCard } from './SkillCard'
import { SkillEditor } from './SkillEditor'

interface Props {
  onClose: () => void
}

export function SkillsPanel({ onClose }: Props) {
  const { skills, loading, fetchSkills, saveSkill, createSkill, deleteSkill, uploadSkill } = useSkills()
  const [editing, setEditing] = useState<Skill | null | 'new'>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchSkills() }, [fetchSkills])

  const handleSave = async (data: Omit<Skill, 'filename'>, filename: string) => {
    if (editing === 'new') {
      await createSkill(data)
    } else {
      await saveSkill(filename, data)
    }
    setEditing(null)
  }

  const handleToggle = async (skill: Skill) => {
    const newStatus = skill.status === 'active' ? 'inactive' : 'active'
    await saveSkill(skill.filename, { ...skill, status: newStatus as 'active' | 'inactive' | 'beta' })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadSkill(file)
    e.target.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border-sub)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {editing ? (editing === 'new' ? 'New skill' : `Edit — ${(editing as Skill).name}`) : 'Skills'}
          </div>
          {!editing && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Manage what the AI can do
            </div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-secondary)',
          fontSize: 20, cursor: 'pointer', lineHeight: 1,
        }}>×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {editing ? (
          <SkillEditor
            skill={editing === 'new' ? null : editing as Skill}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        ) : loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {skills.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
                No skills yet. Create one below.
              </div>
            )}
            {skills.map(s => (
              <SkillCard
                key={s.filename}
                skill={s}
                onEdit={setEditing}
                onDelete={deleteSkill}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {!editing && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-sub)', display: 'flex', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: '0 0 auto', background: 'var(--btn-bg)', border: '1px solid var(--btn-border)',
              borderRadius: 8, padding: '10px 14px', color: 'var(--btn-text)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Upload .md
          </button>
          <button
            onClick={() => setEditing('new')}
            style={{
              flex: 1, background: 'var(--btn-bg)', border: '1px solid var(--btn-border)',
              borderRadius: 8, padding: '10px', color: 'var(--btn-text)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            + New skill
          </button>
        </div>
      )}
    </div>
  )
}
