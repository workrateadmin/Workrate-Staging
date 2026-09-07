---
name: WorkRate environment isolation
description: Durable release and runtime boundaries between development, staging, and production.
---

`WORKRATE_ENV` is authoritative and accepts only `development`, `staging`, or `production`. Database environment markers must be initialized out-of-band and are immutable; application startup only verifies them.

**Why:** Automatically labelling an unmarked database from the process environment could bless a production database as development before any mismatch was detected.

**How to apply:** Never infer runtime identity from hostname or `NODE_ENV`. Only development may run startup migrations. Promotion must pass the read-only release gate before build; staging/production bucket fingerprints are independently provisioned pins, never derived from the currently configured bucket. Keep the stronger transactional DB assertion at startup while pre-release metadata checks remain non-locking.