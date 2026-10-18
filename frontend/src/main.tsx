import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './AuthGate.tsx'

// Apply the saved theme right away, so the login screen matches it too
try {
  const savedTheme = localStorage.getItem('family-finance-theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

  document.documentElement.dataset.theme =
    savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : prefersDark ? 'dark' : 'light'
} catch {
  // localStorage may be unavailable (private mode)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
)
