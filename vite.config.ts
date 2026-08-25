import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  optimizeDeps: {
    // Downloads is route-split, so pre-bundle its Tauri plugin at startup.
    // Otherwise a running dev client can discover it only on navigation and
    // retain Vite's now-obsolete dependency URL until the page is reloaded.
    include: ['@tauri-apps/plugin-opener'],
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Cargo's build output is huge and its files get locked mid-compile;
      // watching it can crash Vite with EBUSY on Windows. Generated reports
      // also change rapidly during QA and must not trigger client reloads.
      ignored: [
        '**/src-tauri/target/**',
        '**/coverage/**',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/dist/**',
      ],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const localeModule = id.match(/[\\/]src[\\/]locales[\\/]([^\\/]+)\.ts$/)
          if (localeModule) {
            return `locale-${localeModule[1]}`
          }
          if (id.includes('node_modules')) {
            if (id.includes('framer-motion')) {
              return 'motion-vendor'
            }
            if (id.includes('lucide-react')) {
              return 'icons-vendor'
            }
            if (id.includes('@tauri-apps')) {
              return 'tauri-vendor'
            }
            if (id.includes('react-router') || id.includes('@remix-run')) {
              return 'router-vendor'
            }
            if (id.includes('react-dom')) {
              return 'react-dom-vendor'
            }
            if (/[\\/]node_modules[\\/](react|scheduler)[\\/]/.test(id)) {
              return 'react-vendor'
            }
            if (id.includes('@tanstack')) {
              return 'tanstack-vendor'
            }
          }
        },
      },
    },
  },
})


