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