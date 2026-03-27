import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import federation from '@originjs/vite-plugin-federation'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'roboAnalyzer',
      remotes: {
        airSwmmApp: 'http://localhost:5174/assets/remoteEntry.js',
      },
      shared: ['vue', 'pinia'],
    }),
  ],
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
      // air-swmm API 프록시 (Module Federation 원격 모듈용)
      '/air-swmm': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
      '/api/gateway': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        // rewrite 제거 - Spring Gateway가 /api/gateway 접두사 포함 경로를 처리
        // SSE 스트리밍 지원
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // 스트리밍 요청: 버퍼 없이 전달 (causal-analysis/stream, /stream/, /react)
            if (req.url?.includes('/stream') || req.url?.includes('/react')) {
              proxyReq.setHeader('Accept', 'application/x-ndjson, text/event-stream')
              proxyReq.setHeader('Cache-Control', 'no-cache')
              proxyReq.setHeader('Connection', 'keep-alive')
            }
          })
        },
        ws: false
      }
    }
  },
  optimizeDeps: {
    include: ['monaco-editor']
  },
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  }
})
