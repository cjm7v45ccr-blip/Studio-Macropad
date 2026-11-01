import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildPublicFirmwareCatalogJson } from './serverFirmwareCatalog';

function publicFirmwareCatalogPlugin(): Plugin {
  const publicDir = path.resolve(import.meta.dirname, 'public');
  return {
    name: 'public-firmware-catalog',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cleanUrl = (req.url || '').split('?')[0];
        if (cleanUrl === '/firmware-catalog.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.end(buildPublicFirmwareCatalogJson(publicDir));
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firmware-catalog.json',
        source: buildPublicFirmwareCatalogJson(publicDir)
      });
    }
  };
}

const PWA_DEV_ENTRY_VIRTUAL = '/@vite-plugin-pwa/pwa-entry-point-loaded';
const RESOLVED_PWA_DEV_ENTRY_NOOP = '\0pwa-dev-entry-noop';

function pwaSafeDevPrePlugin(): Plugin {
  return {
    name: 'pwa-safe-dev-pre',
    enforce: 'pre',
    apply: 'serve',
    resolveId(id) {
      if (id === PWA_DEV_ENTRY_VIRTUAL) {
        return RESOLVED_PWA_DEV_ENTRY_NOOP;
      }
      return undefined;
    },
    load(id) {
      if (id === RESOLVED_PWA_DEV_ENTRY_NOOP) {
        return 'export default function registerDevSW() {}\n';
      }
      return undefined;
    },
  };
}

function pwaSafeDevPostPlugin(): Plugin {
  return {
    name: 'pwa-safe-dev-post',
    enforce: 'post',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<script id="vite-plugin-pwa:register-dev-sw"[\s\S]*?<\/script>\s*/g,
          ''
        );
      },
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      pwaSafeDevPrePlugin(),
      publicFirmwareCatalogPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'favicon.ico',
          'apple-touch-icon-180.png',
          'logo-mark-dark.svg',
          'logo-mark-light.svg',
          'logo-mark-mono.svg',
          'icon.svg',
        ],
        workbox: {
          globIgnores: ['**/*.bin', '**/firmware-catalog.json'],
          navigateFallbackDenylist: [/\.bin$/i, /firmware-catalog\.json$/i]
        },
        manifest: {
          id: '/',
          name: 'BertoPad',
          short_name: 'BertoPad',
          description: 'Configure your ESP32 BertoPad over Web Serial with 3-host Easy-Switch Bluetooth, OLED HUD preview, Smart Actions macros, rotary knob presets, and Smart TV control.',
          theme_color: '#14161B',
          background_color: '#14161B',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/app-icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/app-icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
          suppressWarnings: true,
        },
      }),
      pwaSafeDevPostPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
