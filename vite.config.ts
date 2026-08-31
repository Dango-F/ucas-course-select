import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          icons: ['lucide-vue-next'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
