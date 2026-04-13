import type { Artifact } from '../../types'

interface Props {
  artifacts: Artifact[]
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const handleDownload = () => {
    const mime = artifact.type === 'csv' ? 'text/csv' : 'text/markdown'
    const blob = new Blob([artifact.content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = artifact.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const icon = artifact.type === 'csv' ? '📊' : '📄'
  const typeLabel = artifact.type === 'csv' ? 'CSV' : 'Markdown'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'var(--bg-card)',
      border: '1px solid var(--border-sub)',
      borderRadius: 8,
      padding: '10px 14px',
      marginTop: 8,
    }}>
      <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: 'var(--text-primary)',
          fontSize: 13,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {artifact.filename}
        </div>
        <div style={{
          display: 'inline-block',
          marginTop: 3,
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          padding: '1px 6px',
          fontSize: 11,
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
        }}>
          {typeLabel}
        </div>
      </div>
      <button
        onClick={handleDownload}
        style={{
          background: 'var(--btn-bg)',
          color: 'var(--btn-text)',
          border: 'none',
          borderRadius: 6,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Download
      </button>
    </div>
  )
}

export function ArtifactRenderer({ artifacts }: Props) {
  return (
    <div style={{ marginTop: 8 }}>
      {artifacts.map((artifact, i) => (
        <ArtifactCard key={i} artifact={artifact} />
      ))}
    </div>
  )
}
