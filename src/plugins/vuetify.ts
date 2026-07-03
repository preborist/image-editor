import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

import { createVuetify } from 'vuetify'

// Design tokens exported from SCSS via ICSS `:export` — the JS themes below are
// derived from the exact same values used by our raw SCSS and Vuetify's SASS.
import tokens from '@/styles/tokens.module.scss'

export const THEME_DARK = 'printedit-dark'
export const THEME_LIGHT = 'printedit-light'

const brand = {
  primary: tokens.primary,
  secondary: tokens.accent,
  error: tokens.danger,
  warning: tokens.warning,
}

export const vuetify = createVuetify({
  theme: {
    defaultTheme: THEME_DARK,
    themes: {
      [THEME_DARK]: {
        dark: true,
        colors: {
          ...brand,
          background: tokens.darkBg,
          surface: tokens.darkSurface,
          'on-surface': tokens.darkText,
          'on-background': tokens.darkText,
        },
      },
      [THEME_LIGHT]: {
        dark: false,
        colors: {
          ...brand,
          background: tokens.lightBg,
          surface: tokens.lightSurface,
          'on-surface': tokens.lightText,
          'on-background': tokens.lightText,
        },
      },
    },
  },
  defaults: {
    VBtn: { variant: 'flat' },
  },
})
