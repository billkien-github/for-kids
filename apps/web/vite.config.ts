import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // mở được từ iPad trong cùng mạng LAN khi dev
    proxy: {
      '/api': 'http://localhost:3000',
      '/mcp': 'http://localhost:3000',
    },
  },
})
