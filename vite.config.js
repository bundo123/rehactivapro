import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Multi-page: además de la app (index.html), dos páginas legales estáticas y públicas
// (/privacidad y /terminos). No cargan el bundle de la app ni supabase-js: son HTML + CSS.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        privacidad: resolve(import.meta.dirname, 'privacidad.html'),
        terminos: resolve(import.meta.dirname, 'terminos.html'),
      },
    },
  },
})
