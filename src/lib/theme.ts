export type Theme = 'dark' | 'paper'

export const THEME_STORAGE_KEY = 'pp-theme'

export function isTheme(value: string | null): value is Theme {
  return value === 'dark' || value === 'paper'
}

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return isTheme(stored) ? stored : 'dark'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'paper') {
    root.setAttribute('data-theme', 'paper')
    root.classList.remove('dark')
  } else {
    root.removeAttribute('data-theme')
    root.classList.add('dark')
  }
}
