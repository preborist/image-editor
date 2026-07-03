import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'

const repoName = 'image-editor'
const isProd = process.env.NODE_ENV === 'production'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    // Auto-imports Vuetify components/directives and compiles Vuetify's SASS
    // with our variable overrides so design tokens are the single source of truth.
    vuetify({
      styles: {
        configFile: 'src/styles/vuetify-settings.scss',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  base: isProd ? `/${repoName}/` : '/',
})
