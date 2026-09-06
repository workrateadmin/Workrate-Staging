---
name: HMRC gateway Caddy evidence
description: Deployment-specific rule for preserving directly observed browser network evidence through Caddy.
---

Use Caddy v2's canonical request placeholders for the gateway's observed client host and source port. Keep the Node gateway bound to loopback and trust the resulting custom evidence headers only from a loopback peer.

**Why:** Legacy shorthand placeholders produced missing or invalid observed connection metadata in the live Droplet path. A valid published-browser attestation then failed closed with HTTP 400 before any HMRC call.

**How to apply:** After any gateway or Caddy replacement, validate the Caddyfile, reload Caddy, and repeat one genuine published-browser sandbox attestation. Never work around evidence failures with browser-supplied IP/port data or wildcard proxy trust.