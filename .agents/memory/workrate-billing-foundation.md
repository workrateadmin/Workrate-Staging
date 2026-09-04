---
name: WorkRate billing foundation
description: Durable commercial-state and migration-safety rules for onboarding, plans, usage, and future billing providers.
---

Existing companies with no onboarding or subscription state keep legacy access and must never be forced into the new onboarding or payment flow. Creating onboarding state is an explicit new-user action rather than a read-time side effect.

**Why:** The commercial foundation was introduced after active businesses already existed. Inferring migration intent from login, Clerk identity, or company age risks locking existing tenants out or changing production ownership/data.

**How to apply:** Keep entitlement resolution server-side and treat the absence of billing state as legacy access. New sign-ups may explicitly enter onboarding; ordinary sign-ins continue to the existing dashboard.

Paid-trial pricing defaults to 50% of each product's server-controlled monthly price, with an optional server-side override. Core is £29/month and Complete is £99/month; add-on prices and usage allowances remain unset until commercially approved.

**Why:** Fixed introductory prices drifted from the intended commercial rule, while inventing add-on prices or allowances would create unsupported customer promises.

**How to apply:** Calculate and submit all monetary values on the server. Customer UI may summarize catalog values but must never send authoritative amounts. Missing commercial configuration keeps a product visible but not purchasable.

Billing providers must remain behind one server-side interface. A missing provider returns a clear unavailable result and must never create paid/trial state or grant entitlements.

**Why:** Stripe was intentionally deferred while the rest of onboarding, catalog, usage, and billing UI was built. Provider-specific checkout and webhook code should not leak into product routes or clients.

**How to apply:** Add hosted checkout, portal, signature verification, and synchronization inside the provider implementation. Keep product prices/allowances in server configuration/database mapping, and never invent add-on prices or usage allowances.