import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow the sandbox proxy host so Vite doesn't block it as a DNS-rebinding attack.
    allowedHosts: true,
    // Proxy /api/* to the FastAPI backend on :8001. This lets the browser use
    // same-origin relative URLs (no mixed-content https->http errors, no CORS).
    // Vite's http-proxy streams SSE chunks through unbuffered by default.
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
})
