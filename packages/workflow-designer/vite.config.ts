import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    emptyOutDir: false,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'style' },
    rollupOptions: {
      external: ['vue', '@vue-flow/core', 'elkjs/lib/elk.bundled.js'],
      output: {
        globals: { vue: 'Vue', '@vue-flow/core': 'VueFlow', 'elkjs/lib/elk.bundled.js': 'ELK' },
      },
    },
  },
})
