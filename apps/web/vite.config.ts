import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Mã phiên bản của bản build: nhúng vào code và ghi ra dist/version.json, để app trên iPad
// (nhất là web app ở màn hình chính, vốn không tự tải lại) biết khi nào có bản mới.
const APP_VERSION = new Date().toISOString()

const versionFile = (): Plugin => ({
  name: 'app-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) })
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  server: {
    host: true, // mở được từ iPad trong cùng mạng LAN khi dev
    proxy: {
      '/api': 'http://localhost:3000',
      '/mcp': 'http://localhost:3000',
      '/agent': 'http://localhost:3000',
    },
  },
})
