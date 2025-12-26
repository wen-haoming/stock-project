import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { existsSync } from 'fs'

// 检测是否在 Docker 环境中（通过检查 /.dockerenv 文件）
const isDocker = existsSync('/.dockerenv') || process.env.DOCKER_ENV === 'true'
const apiTarget = isDocker ? 'http://server:8080' : 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        timeout: 120000, // 2分钟超时
      },
    },
  },
  optimizeDeps: {
    include: ['lightweight-charts'],
  },
})
