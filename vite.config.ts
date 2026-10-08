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
      host: true,
      port: 5173,
      proxy: {
        '/api/camunda': {
          target: env.CAMUNDA_PROXY_TARGET,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/camunda/, '/engine-rest'),
          ...(env.CAMUNDA_PROXY_AUTH ? { auth: env.CAMUNDA_PROXY_AUTH } : {}),
        },
        '/api': {
          target: env.API_PROXY_TARGET,
          changeOrigin: true,
          ...(env.API_PROXY_AUTH ? { auth: env.API_PROXY_AUTH } : {}),
        },
      },
    },
  }
})
