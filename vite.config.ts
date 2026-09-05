import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/floatloops/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'FloatLoops',
        short_name: 'FloatLoops',
        description: 'A drum machine for making beats.',
        theme_color: '#12121a',
        background_color: '#12121a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/floatloops/',
        scope: '/floatloops/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
