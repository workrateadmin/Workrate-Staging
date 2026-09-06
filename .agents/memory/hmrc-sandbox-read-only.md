---
name: HMRC sandbox and fraud boundary
description: Security and operational constraints for tenant-bound Income Tax MTD preparation and sandbox traffic.
---

HMRC access is sandbox-only: constrain the API host to the test origin and never
reuse the generic integrations store for HMRC secrets. Business/obligation reads
and obligation-bound preparation may run in WorkRate, but outbound updates stay
disabled until a controlled gateway can satisfy the fraud-prevention boundary.

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

Quarterly preparation and review are not proof of filing. A submission attempt
must remain blocked or retry-required unless HMRC sandbox explicitly confirms
acceptance and returns a reference. Human declaration, deterministic payload
hashing, tenant-scoped idempotency, and persisted attempt history are mandatory.

**Why:** OAuth success and locally valid totals say nothing about whether the
required per-request network evidence was truthful or whether HMRC accepted an
update.

**How to apply:** Bind each preparation to the exact cached business and
obligation period. Exclude unreviewed, unsupported, and potentially duplicate
transactions. Never show `submitted` from configuration, HTTP reachability, or
an unverified gateway response.

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

The HMRC sandbox token endpoint requires both `client_id` and `client_secret` in
the URL-encoded authorization-code exchange body, even when the same
credentials are also sent through HTTP Basic authentication.

**Why:** Production rejected otherwise valid callbacks with `invalid_request`
because Basic authentication alone was insufficient for the sandbox token
endpoint.

**How to apply:** Keep both form fields server-side and URL-encoded; never log
the request body or credential values.

The controlled edge uses Caddy's directly observed remote IP and source port,
passed to Node only over a loopback connection. Browser claims and forwarded
headers from non-loopback peers are never evidence. Browser attestations bind
tenant, user, Clerk session, exact telemetry, and observed network values and
must remain short-lived and one-use per operation.

**Why:** Replit cannot truthfully observe the browser-to-gateway public hop, and
HMRC's validator must prove whether the observed ephemeral source port is
acceptable rather than relying on an assumption.

**How to apply:** Keep WorkRate on Replit and deploy the narrow sandbox-only
gateway separately. Use exact-body HMAC requests with timestamp, UUID replay
protection, method and path. Never persist grants, attestations, or browser
telemetry. HMRC's v5 cumulative endpoint is documented, but configure its path,
method, and media type only after confirming the API version enabled for the
WorkRate HMRC application.

When required fraud evidence is unavailable and no written omission approval is
configured, return a safe normalized omission-required result with header names
only, before obtaining an HMRC token or sending any validation request.

**Why:** A generic unavailable result hid whether browser attestation had
succeeded and made a deliberate fail-closed omission boundary look like an HMRC
connectivity problem.

**How to apply:** Distinguish attestation, omission, sandbox authentication, and
timeout failures in the server response. Keep values redacted, and prove with a
regression test that the omission branch performs zero outbound HMRC calls.