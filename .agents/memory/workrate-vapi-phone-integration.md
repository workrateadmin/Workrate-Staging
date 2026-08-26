---
name: WorkRate Vapi phone integration architecture
description: How WorkRate maps Vapi phone numbers/assistants to tenants, and the assistant-request event that must be handled for dynamic/server-resolved assistants.
---

## Tenant mapping
- Vapi config for each tenant lives in the `integrations` table (`provider = 'vapi'`), `config` column is a JSON **string** (not jsonb) with `assistantId`, `phoneNumberId`, `phoneNumber`, `encryptedWebhookSecret`, `enabled`.
- Always parse `config` with `parseVapiIntegrationConfig` (safe JSON parse) — never pass the raw string into object helpers.
- `findVapiBusiness(assistantId, phoneNumberId, phoneNumber)` in `artifacts/api-server/src/services/vapi.ts` resolves the tenant by matching any of the three identifiers against connected `vapi` integration rows.
- Dev and prod have separate DBs (like Clerk), so a tenant's real Vapi mapping only exists in the **production** `integrations` table — querying dev will show no rows even when prod is fully configured.

## assistant-request is a required webhook event, not optional
- A Vapi phone number can be configured two ways: (a) a static `assistantId` directly on the phone-number resource, or (b) a `server` block (url + credentialId) with **no** `assistantId`, which makes Vapi send a synchronous `assistant-request` webhook event before every inbound call to ask which assistant to use.
- **Why this matters:** switching a phone number to server-based resolution (e.g. to support per-tenant dynamic variables like `{{businessName}}` in the assistant prompt) silently starts requiring `assistant-request` handling. If the webhook doesn't handle it, Vapi gets a useless ack (e.g. `{received:true,ignored:true}`) instead of `{assistantId: ...}`/`{assistant:{...}}`/`{destination:{...}}`, and the call never gets a valid assistant — Vapi never even creates a `Call` record for it (it won't show up in `GET /call`), and the caller hears a generic Vapi-side fallback message instead of the assistant.
- **How to apply:** any webhook route bound as a Vapi assistant `server.url` or phone-number `server.url` must explicitly handle `message.type === "assistant-request"` and respond within ~7.5s with one of the documented shapes. Don't assume "ignore unknown event types" is safe for Vapi server webhooks the way it is for many other providers' webhooks — for this specific message type, a non-response is a functional break, not a no-op.
- Detect it with a dedicated check (mirroring `isVapiEndOfCallEvent`): `message.type === "assistant-request"`. Do this check **before** the generic "not end-of-call → ignore" fallback.
