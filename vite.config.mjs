import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 8080,
    strictPort: true,
    open: '/src/',
  },
  preview: {
    host: '127.0.0.1',
    port: 8080,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
  },
})
