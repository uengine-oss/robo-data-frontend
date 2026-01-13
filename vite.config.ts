import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler', // legacy-js-api 경고 제거
        silenceDeprecations: ['legacy-js-api']
      }
    }
  },
  server: {
    port: 3000,
    host: '127.0.0.1',  // Gateway에서 접근 가능하도록 IPv4로 바인딩
    proxy: {
      // 모든 API Gateway 요청을 Spring Gateway(9000)로 프록시
      '/api/gateway': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gateway/, ''),
        // SSE 스트리밍 지원
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // SSE 요청 감지
            if (req.url?.includes('/stream/') || req.url?.includes('/react')) {
              proxyReq.setHeader('Accept', 'text/event-stream')
              proxyReq.setHeader('Cache-Control', 'no-cache')
              proxyReq.setHeader('Connection', 'keep-alive')
            }
          })
        }
      }
    }
  },
  optimizeDeps: {
    include: ['monaco-editor']
  }
})
