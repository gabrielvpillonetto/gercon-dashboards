import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    proxy: {
      '/ckan-api': {
        target: 'https://dadosabertos.poa.br',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ckan-api/, ''),
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/ckan-api': {
        target: 'https://dadosabertos.poa.br',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ckan-api/, ''),
      },
    },
  },
})
