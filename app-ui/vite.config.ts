import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend port for the dev proxy; start-app.bat sets VITE_BACKEND_PORT.
const backend = `http://localhost:${process.env.VITE_BACKEND_PORT || 5000}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Exposes server to the local network (WiFi)
    allowedHosts: true, // Allows localtunnel / ngrok hosts
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        secure: false,
        // Same-origin from the browser's view; the backend's CORS list only
        // knows fixed dev origins, so don't forward a custom-port Origin.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'))
        },
      },
      '/uploads': {
        target: backend,
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: backend,
        ws: true,
      }
    }
  }
})
