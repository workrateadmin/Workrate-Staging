---
name: WorkRate environment isolation
description: Durable release and runtime boundaries between development, staging, and production.
---

`WORKRATE_ENV` is authoritative and accepts only `development`, `staging`, or `production`. Database environment markers must be initialized out-of-band and are immutable; application startup only verifies them.

**Why:** Automatically labelling an unmarked database from the process environment could bless a production database as development before any mismatch was detected.

**How to apply:** Never infer runtime identity from hostname or `NODE_ENV`. Only development may run startup migrations. A production artifact build may validate configuration and the independently provisioned pin, but must defer actual bucket fingerprint and resource-marker checks because Replit injects the workspace bucket there. At published API startup, verify the runtime bucket against the pin plus both immutable markers before invoking any listening work. Keep the stronger transactional DB assertion at startup.

Use `singleton IS TRUE`, not a bare boolean expression, for the database marker's singleton check.

**Why:** PostgreSQL normalizes equality-to-true checks to a bare boolean expression, and Replit's publish diff generator can malformed that introspection as a nested `CHECK (CHECK (...))`.

**How to apply:** Keep the out-of-band initializer and development constraint in the explicit `IS TRUE` form before validating the development-to-production schema diff.

Production publishing overrides for App Storage can take precedence over the bucket selected in the App Storage Production view.

**Why:** A release gate correctly rejected a deployment whose expected fingerprint matched the independently verified Production bucket, but whose publishing-level storage paths still targeted another bucket.

**How to apply:** When bucket identity fails, inspect the presence and scope of all three production storage overrides together. Align the bucket ID and both storage-root bucket segments while preserving their path suffixes; never accept the deployment's current bucket merely because it is configured.

Production artifact builds receive the workspace App Storage binding rather than the published runtime's Production App Storage binding.

**Why:** Enforcing the production bucket fingerprint during artifact build repeatedly rejected a correctly pinned production bucket using the workspace bucket fingerprint instead.

**How to apply:** Keep production build validation static and fail-closed for environment, immutable build ID, pin format/presence, provider compatibility, and configuration/path safety. Treat the published API's pre-listen startup gate as authoritative for actual bucket fingerprint, storage marker, and database marker identity.