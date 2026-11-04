/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildCsp } from './src/lib/csp';

// BASE_PATH setzt der Deploy-Workflow (GitHub Pages: /drueckjagdApp/app/).
const base = process.env.BASE_PATH ?? '/';

/** Sicherheits-Meta-Tags nur im Build (der Entwicklungsserver braucht Inline-Skripte für HMR). */
function securityHeaders(): Plugin {
  let csp = '';
  return {
    name: 'drueckjagd-security-meta',
    apply: 'build',
    configResolved(config) {
      csp = buildCsp(loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_').VITE_SUPABASE_URL ?? '');
    },
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
      { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  base,
  plugins: [
    securityHeaders(),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'] },
      manifest: {
        id: base,
        name: 'Drückjagd',
        short_name: 'Drückjagd',
        description: 'Drückjagd- und Revierverwaltung für Jagdleitung, Schützen und Treiber',
        lang: 'de',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        background_color: '#f6f1e6',
        theme_color: '#24402f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
