import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT and BASE_PATH are only required for the dev server, not for production builds
const rawPort = process.env.PORT;
const isBuild = process.env.NODE_ENV === 'production' || process.argv.includes('build');

if (!isBuild && !rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort ?? '3000');

if (!isBuild && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';
const pwaBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay({
      // Suppress the overlay for unknown/cross-origin errors (e.g. Clerk SDK
      // unhandled rejections that have no actionable stack trace).  Real errors
      // from our own code will still have a stack and will still show.
      filter: (err) => Boolean(err.stack) && err.message !== '(unknown runtime error)',
    }),
    VitePWA({
      // 'prompt' — we control when to activate the new SW via the PwaUpdatePrompt
      // component, avoiding unexpected mid-session page reloads.
      registerType: 'prompt',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectManifest: {
        // This worker intentionally performs runtime caching only. It cannot
        // pre-cache under a build-time namespace because that namespace is
        // authoritative only after /api/runtime-config responds.
        injectionPoint: undefined,
      },

      // Web app manifest — required for "Add to Home Screen" on iOS/Android.
      manifest: {
        name: 'WorkRate',
        short_name: 'WorkRate',
        description: 'Manage your trades pipeline',
        start_url: pwaBasePath,
        scope: pwaBasePath,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0E1629',
        icons: [
          {
            src: `${pwaBasePath}icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${pwaBasePath}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: `${pwaBasePath}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      // Dev mode: disable SW in development to avoid confusing cache behaviour
      // in the Replit preview pane.  The service worker only runs in the
      // production build.
      devOptions: {
        enabled: false,
      },
    }),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
