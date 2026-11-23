import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: [
    { find: '@workflow/designer/style.css', replacement: fileURLToPath(new URL('./packages/workflow-designer/src/style.css', import.meta.url)) },
    { find: '@workflow/designer', replacement: fileURLToPath(new URL('./packages/workflow-designer/src/index.ts', import.meta.url)) },
    { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
  ] },
  test: { environment: 'jsdom', include: ['tests/forms/**/*.test.ts'], maxWorkers: 2 },
})
