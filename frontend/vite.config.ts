import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite dev server proxies /api and /hubs to the .NET backend so the SPA can
// call relative paths. This sidesteps any CORS misconfig during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/hubs': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
      // Proxy ONLY the asset paths the backend owns (DB-managed product photos
      // and admin uploads). Vite-bundled assets (e.g. /assets/<hash>.png from
      // imported brand logos) stay served by Vite itself.
      '/assets/products': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/assets/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
