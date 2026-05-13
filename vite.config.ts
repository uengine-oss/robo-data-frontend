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
        // NDJSON / SSE 스트리밍 통과 — 버퍼링 비활성화
        selfHandleResponse: false,
        configure: (proxy) => {
          const STREAM_PATTERNS = ['/stream', '/react', '/analyze', '/parsing', '/pipeline']
          const isStreamReq = (url?: string) =>
            !!url && STREAM_PATTERNS.some(p => url.includes(p))

          proxy.on('proxyReq', (proxyReq, req) => {
            if (isStreamReq(req.url)) {
              proxyReq.setHeader('Accept', 'application/x-ndjson, text/event-stream')
              proxyReq.setHeader('Cache-Control', 'no-cache')
              proxyReq.setHeader('Connection', 'keep-alive')
            }
          })
          proxy.on('proxyRes', (proxyRes, req) => {
            if (isStreamReq(req.url)) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform'
              proxyRes.headers['x-accel-buffering'] = 'no'
              delete proxyRes.headers['content-length']
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
