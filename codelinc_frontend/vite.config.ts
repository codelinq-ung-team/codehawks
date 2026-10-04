import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // In development, /api goes to the local backend (see backend/README.md).
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
