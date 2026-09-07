// @ts-nocheck
/// <reference lib="webworker" />

/**
 * Runtime caches are deliberately named only after the server confirms the
 * environment and deployment build. This prevents one deployment's data from
 * being used by another when they share an origin.
 */
const API_PREFIX = "/api/";
const CACHE_PREFIX = "workrate-";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "") || "";

let configPromise;

function getRuntimeConfig() {
  if (!configPromise) {
    configPromise = fetch("/api/runtime-config", {
      cache: "no-store",
      credentials: "same-origin",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Unable to load runtime configuration");
      const config = await response.json();
      if (
        !["development", "staging", "production"].includes(config.environment) ||
        typeof config.buildId !== "string" ||
        !config.buildId
      ) {
        throw new Error("Invalid runtime configuration");
      }
      return config;
    });
  }
  return configPromise;
}

function cacheName(kind, config) {
  return `${CACHE_PREFIX}${config.environment}-${encodeURIComponent(config.buildId)}-${kind}`;
}

function isAsset(url) {
  return url.pathname.startsWith(`${basePath}/assets/`) &&
    /\.(js|css)$/i.test(url.pathname);
}

function isMedia(url) {
  return /\.(png|svg|jpe?g|webp|woff2?|ico)$/i.test(url.pathname);
}

async function cacheResponse(cache, request, response) {
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  // Fetching the server-owned namespace before activation prevents cache
  // migration when the runtime identity cannot be verified.
  event.waitUntil(getRuntimeConfig());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const config = await getRuntimeConfig();
    const namespace = `${CACHE_PREFIX}${config.environment}-${encodeURIComponent(config.buildId)}-`;
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && !key.startsWith(namespace))
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // /api/* remains NetworkOnly, including the runtime configuration endpoint.
  if (url.pathname.startsWith(API_PREFIX)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith((async () => {
    let config;
    try {
      config = await getRuntimeConfig();
    } catch {
      return fetch(request);
    }

    if (request.mode === "navigate") {
      const cache = await caches.open(cacheName("html", config));
      try {
        return await cacheResponse(cache, request, await fetch(request));
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error("Navigation unavailable offline");
      }
    }

    if (isAsset(url)) {
      const cache = await caches.open(cacheName("assets", config));
      const cached = await cache.match(request);
      return cached || cacheResponse(cache, request, await fetch(request));
    }

    if (isMedia(url)) {
      const cache = await caches.open(cacheName("media", config));
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => cacheResponse(cache, request, response));
      return cached || network;
    }

    return fetch(request);
  })());
});