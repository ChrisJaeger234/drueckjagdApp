import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH wird beim Deploy auf GitHub Pages gesetzt (z. B. /drueckjagdApp/).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Drückjagd PWA-Test',
        short_name: 'Jagd-Test',
        description: 'Machbarkeitstest für Offline-Karte, GPS und Benachrichtigungen',
        lang: 'de',
        display: 'standalone',
        start_url: base,
        scope: base,
        background_color: '#f4f2ec',
        theme_color: '#2e4a2e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
