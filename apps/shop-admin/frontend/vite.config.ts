import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The web screens talk to the local Python backend on port 8000.
// Online they live under the website's address: build with VITE_BASE_PATH=/shop-admin/.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 1200 },
})
