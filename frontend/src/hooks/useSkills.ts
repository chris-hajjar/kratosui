import { useState, useCallback } from 'react'
import type { Skill } from '../types'

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(false)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/skills')
      setSkills(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  const saveSkill = useCallback(async (filename: string, data: Omit<Skill, 'filename'>) => {
    await fetch(`/api/skills/${filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await fetchSkills()
  }, [fetchSkills])

  const createSkill = useCallback(async (data: Omit<Skill, 'filename'>) => {
    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await fetchSkills()
  }, [fetchSkills])

  const deleteSkill = useCallback(async (filename: string) => {
    await fetch(`/api/skills/${filename}`, { method: 'DELETE' })
    await fetchSkills()
  }, [fetchSkills])

  const uploadSkill = useCallback(async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    await fetch('/api/skills/upload', { method: 'POST', body: form })
    await fetchSkills()
  }, [fetchSkills])

  return { skills, loading, fetchSkills, saveSkill, createSkill, deleteSkill, uploadSkill }
}
