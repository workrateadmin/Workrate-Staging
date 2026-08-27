---
name: WorkRate api-server dev workflow has no hot reload
description: The api-server dev workflow builds once then runs the compiled bundle — editing source files does not update the running server.
---

`artifacts/api-server`'s `dev` script is `pnpm run build && pnpm run start` (esbuild bundle to `dist/index.mjs`, then `node dist/index.mjs`) — it does not watch files.

**Why:** a synthetic end-to-end webhook test against the running dev server returned a blank/stale result even though the source fix had already been verified correct in isolation (bundled ad hoc with esbuild and run directly). The workflow was still serving a bundle built before the fix — in this case even before an entire feature — because it was never restarted after the edits.

**How to apply:** after any change to `artifacts/api-server/src/**`, restart the `artifacts/api-server: API Server` workflow before trusting curl/webhook/integration tests against it. A green result from bundling and running a file in isolation (e.g. via a throwaway esbuild + node script) does NOT mean the live dev server reflects that code.
