import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        '/api/camunda': {
          target: env.CAMUNDA_PROXY_TARGET || 'http://192.168.124.202:8085',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/camunda/, '/engine-rest'),
          ...(env.CAMUNDA_PROXY_AUTH ? { auth: env.CAMUNDA_PROXY_AUTH } : {}),
        },
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
