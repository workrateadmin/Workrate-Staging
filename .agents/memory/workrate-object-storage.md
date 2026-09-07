---
name: WorkRate object storage boundary
description: Durable GCS storage plus physical and logical environment isolation
---

## Rule
All durable uploads must use Replit Object Storage, and every physical bucket must be explicitly bound to exactly one WorkRate environment before API startup.

**Why:** Production runs on autoscale. The `uploads/` local dir is ephemeral — wiped on every container restart or instance change. URLs stored in the DB become dead links. The React SPA catch-all serves index.html for missing `/uploads/*` paths, returning HTTP 200 with 1360 bytes of HTML — a silent false-positive that masks the 404.

**Why:** Local files disappear on autoscale restarts. Prefixes alone are also insufficient isolation: a test deployment accidentally configured with the production bucket still has physical credentials for that bucket.

**How to apply:**
- Require the bucket’s immutable marker to match the authoritative runtime environment and actual bucket fingerprint before listening.
- Derive every new physical key and logical object path from that environment; never accept an environment supplied by a request.
- Development and staging reject cross-environment and unprefixed paths. Production alone may read unprefixed legacy objects during migration.
- Initialize a new bucket deliberately; startup must never self-label an unmarked bucket.
- Keep storage origins runtime-aware. Never select a production URL with `NODE_ENV` or a hardcoded host.

**trust proxy:** `app.set("trust proxy", true)` added to `artifacts/api-server/src/app.ts` — required for `req.protocol` to return `https` behind Replit's reverse proxy.
