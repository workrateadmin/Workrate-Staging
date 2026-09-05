---
name: WorkRate Stripe billing
description: Security, account-locking, webhook-readiness, and idempotency constraints for direct Stripe billing.
---

Use `STRIPE_SECRET_KEY` as WorkRate's sole server-side Stripe credential and `STRIPE_WEBHOOK_SECRET` for raw-body webhook verification. Do not route runtime billing or catalog scripts through the Replit Stripe connector.

**Why:** The connector and dashboard-controlled test key can belong to different Stripe accounts, producing mismatched catalogs and webhooks.

**How to apply:** Before every Stripe operation, reject non-test keys and verify the exact approved test account plus `livemode:false`. Keep canonical event retrieval as defense-in-depth after signature verification.

Checkout exclusion must be tenant-wide, not scoped only to a selected plan. Persist a server-owned attempt, reuse unresolved hosted sessions across retries and selection changes, and reconcile completed sessions before allowing another.

**Why:** Client-owned idempotency keys or selection-scoped attempts can create multiple live subscriptions and duplicate charges during retries, redirects, or plan changes.

**How to apply:** Serialize attempt creation per tenant, allow a new attempt only after prior attempts are expired or reconciled, and fetch current Stripe subscription state for webhook convergence rather than applying event snapshots.

Persisted Stripe product, recurring-price, and paid-trial-price IDs are the only runtime billing mappings. A mapping is purchasable only after exact product, currency, cadence, kind, and server-derived amount verification; any pricing or ID edit invalidates that verification.

**Why:** Metadata discovery or unchecked saved IDs can charge a stale Stripe amount that differs from the customer-facing server catalog.

**How to apply:** Fail closed before Checkout or subscription updates, compare Stripe unit amounts with server-computed pence, and restore validation only through the protected validator or verified catalog seed.

All payment and subscription mutations must remain unavailable until startup verifies the approved account, webhook endpoint, required event set, and signing-secret presence.

**Why:** Allowing Checkout while webhook initialization has failed can charge a customer without reconciling entitlement state.

**How to apply:** Reset readiness before initialization and fail Checkout, portal, subscription updates, cancellation, and synchronization closed until initialization succeeds.