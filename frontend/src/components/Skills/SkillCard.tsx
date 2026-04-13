import type { Skill } from '../../types'

const STATUS_COLORS: Record<string, string> = {
  active: '#166534',
  beta: '#854d0e',
  inactive: '#3f3f46',
}

const STATUS_TEXT: Record<string, string> = {
  active: 'Active',
  beta: 'Beta',
  inactive: 'Off',
}

interface Props {
  skill: Skill
  onEdit: (skill: Skill) => void
  onDelete: (filename: string) => void
  onToggle: (skill: Skill) => void
}

export function SkillCard({ skill, onEdit, onDelete, onToggle }: Props) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-sub)',
      borderRadius: 8,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{skill.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {skill.description}
          </div>
        </div>
        <span style={{
          background: STATUS_COLORS[skill.status] ?? '#3f3f46',
          borderRadius: 20, padding: '2px 8px', fontSize: 11, color: '#fff', flexShrink: 0,
        }}>
          {STATUS_TEXT[skill.status] ?? skill.status}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
        <button onClick={() => onToggle(skill)} style={ghostBtn}>
          {skill.status === 'active' ? 'Disable' : 'Enable'}
        </button>
        <button onClick={() => onEdit(skill)} style={ghostBtn}>Edit</button>
        <button onClick={() => onDelete(skill.filename)} style={{ ...ghostBtn, color: '#ef4444' }}>
          Delete
        </button>
      </div>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '4px 10px',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer',
}
