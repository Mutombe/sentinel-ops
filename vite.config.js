import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  server: { port: 5173, open: false },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/[\/]recharts|d3-|victory-/.test(id)) return 'charts'
            if (id.includes('@tanstack')) return 'query'
            if (id.includes('lucide-react')) return 'icons'
            return 'react'
          }
          if (id.includes('/src/pages/portal/')) return 'portal'
          if (id.includes('/src/lib/seed')) return 'seed'
          return undefined
        },
      },
    },
  },
})
