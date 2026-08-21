---
name: HMRC sandbox read-only
description: Security and operational constraints for the tenant-bound HMRC sandbox read-only integration.
---

HMRC access is sandbox-only and read-only: constrain the API host to the test
origin, request only `read:self-assessment`, and use only read endpoints for
business details and obligations. Never reuse the generic integrations store
for HMRC secrets.

**Why:** HMRC tokens, taxpayer identifiers, PKCE material, and fraud-prevention
evidence are more sensitive than the plaintext generic integration config. A
sandbox-only implementation must not provide an accidental path to live
submissions.

**How to apply:** Keep OAuth state tenant-bound, hashed at rest, atomically
single-use before token exchange, and short-lived. Encrypt tokens, taxpayer
identifiers, and PKCE verifiers server-side; never expose them in API responses
or logs. Allow an outbound HMRC call only after all fraud-prevention values come
from genuine browser, network, and controlled-infrastructure sources. Require
explicit trusted proxy CIDRs before accepting forwarded client IP information;
if a required source cannot be obtained or HMRC has not approved its omission,
fail the sync rather than inventing a value. Keep credential actions same-origin
and protect against cross-origin requests.

For `WEB_APP_VIA_SERVER`, do not model `Gov-Vendor-Forwarded`,
`Gov-Vendor-Public-IP`, or `Gov-Vendor-Version` as manually entered static
configuration: the first two describe the current public TLS path and the last
must come from the actual deployed build. A browser-only SaaS app has no
truthful `Gov-Vendor-License-IDs` value. Store an omission only after HMRC has
approved that exact missing datum.

**Why:** HMRC's fraud-prevention specification requires real, per-request
evidence. Static values silently become false when routing, browser sources, or
deployment versions change, and placeholders are expressly prohibited.

**How to apply:** Keep data reads disabled until a controlled ingress can
provide verified public-hop evidence and its exact trusted CIDRs. OAuth setup
may be tested separately, but it does not justify a non-compliant data sync.