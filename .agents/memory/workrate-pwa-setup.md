---
name: WorkRate PWA setup
description: Service worker, manifest, and cache strategy for WorkRate home-screen PWA. Covers root cause of stale-cache bug and how the fix works.
---

# WorkRate PWA Setup

## Root cause of the stale-cache bug
- The workrate web artifact is served as a **Replit static host** (`serve = "static"` in artifact.toml).
- No service worker existed before this fix.
- Replit's static host has no configurable HTTP cache-control headers from user code.
- iOS home-screen web clips apply aggressive heuristic caching (often hours–days) to `index.html`.
- Stale `index.html` → references old hashed JS bundle filenames → old bundles also cached → old app loads.
- The API server (`app.ts`) is NOT responsible for serving workrate static files; Replit's infrastructure handles that.

## Fix applied
- `vite-plugin-pwa` + `workbox-window` added to `artifacts/workrate/package.json`
- `VitePWA()` configured in `vite.config.ts` with `registerType: 'prompt'`
- Workbox strategies:
  - `/api/*` → `NetworkOnly` (never cache authenticated JSON)
  - `navigate` mode → `NetworkFirst` + precache NavigationRoute (SPA shell)
  - `/assets/*.js|css` → `CacheFirst` (content-addressed filenames safe to cache 1 year)
  - images/fonts → `StaleWhileRevalidate` (30 days)
  - `cleanupOutdatedCaches: true`, `clientsClaim: true`
- `manifest.webmanifest` auto-generated with `start_url: "/"`, `scope: "/"`, `display: "standalone"`, WorkRate icons
- Icons generated from `public/logo.svg` via sharp: `icon-192.png`, `icon-512.png`
- `index.html` — added `apple-touch-icon`, `theme-color`, `apple-mobile-web-app-*` meta tags
- `src/components/pwa-update-prompt.tsx` — shows "WorkRate has been updated — reload" toast when new SW is waiting
- `src/App.tsx` — mounts `PwaUpdatePrompt` + `VisibilityRefresher` (invalidates all React Query caches on `visibilitychange: visible`)
- `src/vite-env.d.ts` — added `/// <reference types="vite-plugin-pwa/client" />` for virtual module types

## How SW updates work
1. New deploy → new `sw.js` with new precache revision hashes
2. Browser detects changed `sw.js` → installs new SW (waits because `registerType: 'prompt'`)
3. `PwaUpdatePrompt` detects `needRefresh: true` → shows toast
4. User taps "Reload" → `updateServiceWorker(true)` → sends `SKIP_WAITING` → new SW activates → `clientsClaim()` → page reloads
5. New `index.html` served from new SW's updated precache → new JS bundles → new app

**Why:** `skipWaiting: false` on the workbox side prevents mid-session surprise reloads; user controls when to apply the update.

## Important: SW disabled in dev
`devOptions: { enabled: false }` — the service worker does NOT run in the Replit dev preview. It only activates in the production build. This prevents confusing cache behaviour during development.

## Re-check polling interval
`onRegisteredSW` re-runs `registration.update()` every 60 s. This ensures long-lived home-screen sessions detect new deploys within a minute.
