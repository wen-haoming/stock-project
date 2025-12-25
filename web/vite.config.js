import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: 120000, // 2分钟超时
      },
    },
  },
  optimizeDeps: {
    include: ['lightweight-charts'],
  },
})
