---
name: WorkRate Stripe connector billing
description: Security and idempotency constraints specific to Stripe billing through Replit's connector proxy.
---

Replit's Stripe connector does not expose the Stripe API key or an existing webhook signing secret. Use the connector proxy for Stripe API calls. When registering a webhook endpoint, capture its one-time signing secret, encrypt it at rest, and verify Stripe's raw-body HMAC before processing.

**Why:** Secret-key-based Stripe SDK and sync templates fail with this connector type. Canonical event retrieval alone prevents payload tampering but does not prove Stripe delivered the request.

**How to apply:** Keep connector access inside the billing provider, rotate endpoints whose signing secret is unavailable, and treat authenticated canonical event retrieval as defense-in-depth after signature verification.

Checkout exclusion must be tenant-wide, not scoped only to a selected plan. Persist a server-owned attempt, reuse unresolved hosted sessions across retries and selection changes, and reconcile completed sessions before allowing another.

**Why:** Client-owned idempotency keys or selection-scoped attempts can create multiple live subscriptions and duplicate charges during retries, redirects, or plan changes.

**How to apply:** Serialize attempt creation per tenant, allow a new attempt only after prior attempts are expired or reconciled, and fetch current Stripe subscription state for webhook convergence rather than applying event snapshots.

Persisted Stripe product, recurring-price, and paid-trial-price IDs are the only runtime billing mappings. A mapping is purchasable only after exact product, currency, cadence, kind, and server-derived amount verification; any pricing or ID edit invalidates that verification.

**Why:** Metadata discovery or unchecked saved IDs can charge a stale Stripe amount that differs from the customer-facing server catalog.

**How to apply:** Fail closed before Checkout or subscription updates, compare Stripe unit amounts with server-computed pence, and restore validation only through the protected validator or verified catalog seed.

WorkRate runtime billing currently uses the Replit Stripe connector rather than `STRIPE_SECRET_KEY`; a configured key may target a different Stripe account even when both are test mode.

**Why:** Verifying only that both credentials are test-mode does not prove they address the same catalog, customers, or webhook endpoints.

**How to apply:** Before catalog or checkout verification, compare the connector and direct-key Stripe account IDs without logging credentials. Treat any mismatch as a pre-publish configuration issue and test the runtime against the connector account it actually uses.