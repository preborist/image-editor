import { computed } from 'vue'
import { useTheme } from 'vuetify'

import { THEME_DARK, THEME_LIGHT } from '@/plugins/vuetify'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'printedit.theme'

function preferredMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * App theme control. Keeps the Vuetify theme (for Vuetify components) and the
 * <html data-theme> attribute (for our raw-SCSS `--pe-*` variables) in sync,
 * defaults to the OS preference, and persists an explicit choice.
 */
export function useAppTheme() {
  const theme = useTheme()

  const mode = computed<ThemeMode>(() => (theme.current.value.dark ? 'dark' : 'light'))
  const isDark = computed(() => mode.value === 'dark')

  function apply(nextMode: ThemeMode) {
    theme.change(nextMode === 'dark' ? THEME_DARK : THEME_LIGHT)
    document.documentElement.setAttribute('data-theme', nextMode)
  }

  function setMode(nextMode: ThemeMode) {
    apply(nextMode)
    localStorage.setItem(STORAGE_KEY, nextMode)
  }

  function toggle() {
    setMode(isDark.value ? 'light' : 'dark')
  }

  /** Initialize from saved choice or OS preference (call once at startup). */
  function init() {
    apply(preferredMode())
  }

  return { mode, isDark, setMode, toggle, init }
}
