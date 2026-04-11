import { useState, useEffect } from 'react'

type Theme = 'dark' | 'light'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('kratos-ui-theme') as Theme) ?? 'dark'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('kratos-ui-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggle }
}
