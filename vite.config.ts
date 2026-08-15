import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.png', 'paid.png', 'icons/pwa-192.png', 'icons/pwa-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'],
      workbox: {
        // html-to-image fetches receipt images with cache-busting query params;
        // serve precached logo/paid assets for ANY query string so captures
        // work offline instead of falling through to a failed network fetch
        ignoreURLParametersMatching: [/.*/],
      },
      manifest: {
        name: 'Utshaho Educare – Payment Tracker',
        short_name: 'PaymentTracker',
        description: 'Track student payments and issue receipts for Utshaho Educare.',
        theme_color: '#12314f',
        background_color: '#f5f3ee',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
