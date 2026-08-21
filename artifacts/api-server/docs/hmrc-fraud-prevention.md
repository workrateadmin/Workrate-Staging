# HMRC sandbox read-only setup

WorkRate's HMRC integration is intentionally sandbox-only. It authorises
`read:self-assessment` and only retrieves:

- Business Details MTD API v2
- Obligations MTD API v3

It cannot create submissions, update obligations, or use the live HMRC API.

## Required secure settings

Configure these values in secure workspace settings before connecting a sandbox
test account:

- `HMRC_SANDBOX_CLIENT_ID`
- `HMRC_SANDBOX_CLIENT_SECRET`
- `HMRC_OAUTH_REDIRECT_URL` — must be the HTTPS callback URL ending in
  `/api/hmrc/callback`
- `HMRC_TOKEN_ENCRYPTION_KEY` — a 32-byte random value encoded as base64

`HMRC_SANDBOX_API_BASE_URL` is optional. When supplied, it must remain exactly
on `https://test-api.service.hmrc.gov.uk`; production hosts are rejected by
the server.

## Fraud-prevention data

Income Tax Self Assessment MTD endpoints require fraud-prevention headers.
WorkRate sends them only on the read-only HMRC API calls, not during the OAuth
token exchange.

The web app collects these directly from the browser at the moment a
connection or refresh is requested:

- browser JavaScript user agent
- persistent, per-browser device UUID
- screen dimensions, colour depth, pixel scaling, and window dimensions
- browser timezone offset

The server obtains the client IP from the incoming trusted-proxy request. It
never replaces missing browser or network data with placeholders.

For a browser SaaS app, the following values must be collected or generated
from the current deployment and request. They are **not** manually maintained
environment variables:

- `Gov-Vendor-Forwarded` — the actual public TLS termination path for the
  current request
- `Gov-Vendor-Public-IP` — the public edge address that received the browser
  request
- `Gov-Vendor-Version` — the actual versions of WorkRate software handling the
  request

`Gov-Vendor-License-IDs` does not have a truthful value when WorkRate has not
installed licensed vendor software on the customer's browser. Leave it absent
and obtain HMRC's documented approval before treating it as an omission.

The originating IP must come through a controlled proxy chain. Configure
`HMRC_TRUSTED_PROXY_CIDRS` only when the deployment operator provides the
exact CIDR ranges of those proxy hops; the server refuses an HMRC sync when
this setting is absent instead of trusting an unverified `X-Forwarded-For`
value. Do not guess Replit edge ranges. If another frontend origin legitimately
calls the API, add its exact origin to `CORS_ALLOWED_ORIGINS`. Same-origin
WorkRate requests do not need this CORS setting.

Some reverse-proxy architectures cannot truthfully expose a browser's public
TCP port, and WorkRate does not have reliable per-request MFA factor metadata.
Do **not** invent these values. Ask HMRC for approval before setting
`HMRC_FRAUD_APPROVED_OMISSIONS` to the supported missing headers:

```text
client-public-port,client-multi-factor,vendor-license-ids,vendor-forwarded,vendor-public-ip
```

Only set that variable with an HMRC decision that applies to WorkRate's actual
architecture. Without verified network evidence and documented approval for
any genuinely missing header, WorkRate refuses the outbound sync. OAuth
authorisation can still complete, but no HMRC data will be retrieved until the
evidence is ready.

## Security model

- Access tokens, refresh tokens, PKCE verifiers, and taxpayer IDs are encrypted
  with AES-256-GCM before entering the database.
- OAuth state is random, hashed at rest, tenant-bound, single-use, and expires
  after 10 minutes. It is atomically consumed before any token exchange, so a
  callback cannot be replayed concurrently.
- API status responses expose only safe connection metadata and read-only
  business/obligation results. They never expose a token, verifier, taxpayer
  ID, OAuth state, or raw fraud-prevention headers.
- Disconnect removes the local encrypted connection and outstanding OAuth
  state. It does not alter any WorkRate Finance records or make an HMRC API
  call.
- Connect, refresh, and disconnect actions require a same-origin browser
  request in addition to Clerk authentication.

## Test API

Use the HMRC fraud-prevention Test API and sandbox test users before any
end-to-end trial. `Gov-Test-Scenario` is not set by WorkRate's normal routes;
add it only in a dedicated sandbox test harness when the selected HMRC test
scenario requires it.

Official guidance:

- [HMRC authorisation](https://developer.service.hmrc.gov.uk/api-documentation/docs/authorisation)
- [Fraud prevention](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/)
- [Business Details MTD v2](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/business-details-api/2.0)
- [Obligations MTD v3](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/obligations-api/3.0)