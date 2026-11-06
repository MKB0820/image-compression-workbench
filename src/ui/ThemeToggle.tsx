import { useEffect, useState } from 'react'

type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme-mode'

function readStored(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    // 隐私模式下 localStorage 可能抛错，按跟随系统处理
  }
  return 'system'
}

function isDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(mode: ThemeMode): void {
  const dark = isDark(mode)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

const OPTIONS: Array<{ value: ThemeMode; label: string; path: string }> = [
  {
    value: 'light',
    label: '浅色',
    path: 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z',
  },
  {
    value: 'dark',
    label: '深色',
    path: 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z',
  },
  {
    value: 'system',
    label: '跟随系统',
    path: 'M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25',
  },
]

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(readStored)

  useEffect(() => {
    applyTheme(mode)
  }, [mode])

  // 跟随系统时，系统主题变化要实时反映
  useEffect(() => {
    if (mode !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [mode])

  function choose(next: ThemeMode) {
    setMode(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 存不下就算了，本次会话仍然生效
    }
    applyTheme(next)
  }

  return (
    <div
      role="group"
      aria-label="外观"
      className="flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = mode === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => choose(option.value)}
            className={[
              'rounded-full p-1.5 transition',
              active
                ? 'bg-sunken text-ink'
                : 'text-faint hover:bg-sunken/60 hover:text-muted',
            ].join(' ')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={option.path} />
            </svg>
          </button>
        )
      })}
    </div>
  )
}
