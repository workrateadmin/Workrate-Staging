---
name: WorkRate usage metering
description: Durable rules for paid-feature authorization, atomic limits, provider-event deduplication, and legacy access.
---

Provider-backed actions must follow tenant authorization, entitlement, atomic allowance reservation, provider invocation, then usage finalization or release. Duplicate provider events must stop before any provider call.

**Why:** Read-then-call metering allows concurrent requests and webhook retries to exceed caps or incur duplicate provider costs even when ledger inserts are deduplicated.

**How to apply:** Use deterministic provider references, transactionally serialized reservations, release all pre-start/failure paths, and finalize only successful consumption.

AI Receptionist durations remain provider-reported seconds in the ledger but are converted to whole customer minutes for allowance enforcement and display.

**Why:** Comparing raw seconds with minute-denominated limits caused a 200-minute allowance to stop at 200 seconds.

**How to apply:** Keep units explicit and perform conversion in the central allowance aggregation, not separately in routes or UI.

Legacy premium access is an explicit company marker set during billing migration, never inferred from a missing subscription.

**Why:** Treating every subscription-less company as legacy grants new unpaid businesses wildcard premium access.

**How to apply:** New companies default to normal billing enforcement; preserve the marker only for accounts that existed before deliberate billing migration.

AI Receptionist top-ups are one-time, webhook-authoritative grants bound to the Stripe billing period captured at Checkout.

**Why:** Granting from a browser redirect, accepting client-supplied minutes, or carrying a purchase into another period can create unpaid or stale allowance.

**How to apply:** Resolve pack size and amount server-side, require shared webhook readiness, verify the canonical paid Checkout session, grant once by session/payment identity, and include only current-period grants in effective allowance.