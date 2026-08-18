---
name: WorkRate PWA setup
description: vite-plugin-pwa config, the NavigationRoute stale-cache trap, SW update flow
---

## navigateFallback: null is required

vite-plugin-pwa silently adds `registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")))` to the generated sw.js by DEFAULT. This intercepts every browser navigation and serves precached HTML unconditionally — it runs before any custom `runtimeCaching` rules, including NetworkFirst for navigate mode. The result: normal visits always get the stale precached index.html; only Ctrl+Shift+R (which bypasses the SW entirely) gets the current build.

**Fix already applied:** `navigateFallback: null` in the `workbox:` section of `VitePWA(...)` in `vite.config.ts`. This removes the auto-generated NavigationRoute. The custom `NetworkFirst` runtime rule then owns all navigation requests.

**Why:** Without this, every production deploy leaves users on the old build until their SW is replaced — but with `registerType: 'prompt'` + `skipWaiting: false`, the new SW waits indefinitely and the PwaUpdatePrompt never fires if the broken page can't render it.

**How to apply:** Any time VitePWA is configured with custom `runtimeCaching` that includes a navigate-mode handler, always set `navigateFallback: null` to prevent the default SPA shell from shadowing it.

## Other config decisions

- `registerType: 'prompt'` — user-controlled reload via PwaUpdatePrompt toast
- `skipWaiting: false` — only skip waiting after user confirms; new SW activates on tab close otherwise
- `clientsClaim: true` — new SW immediately takes control of all open clients after activation
- `cleanupOutdatedCaches: true` — removes caches from previous SW versions
- SW disabled in dev (`devOptions: { enabled: false }`) — avoids confusing cache in Replit preview
- `/api/*` → NetworkOnly (never cached)
- navigate mode → NetworkFirst (6s timeout, falls back to cache offline)
- `/assets/*.{js,css}` → CacheFirst 1 year (safe: hashed filenames)
- media/fonts → StaleWhileRevalidate 30 days

## PwaUpdatePrompt

Component at `src/components/pwa-update-prompt.tsx`. Uses `useRegisterSW` from `virtual:pwa-register/react`. Polls for updates every 60s. Shows an infinite-duration toast with a Reload button that calls `updateServiceWorker(true)` (sends SKIP_WAITING to new SW then reloads).
