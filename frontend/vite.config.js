import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow the sandbox proxy host so Vite doesn't block it as a DNS-rebinding attack.
    allowedHosts: true,
  },
})
