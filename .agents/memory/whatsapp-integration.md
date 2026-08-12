---
name: WhatsApp Business integration
description: Full architecture and key decisions for the Meta WhatsApp Cloud API integration in WorkRate
---

# WhatsApp Business Integration

## Architecture

- **Webhook URL**: `https://work-rate-manager.replit.app/api/webhooks/whatsapp`
- **Signature verification**: HMAC-SHA256 via `WHATSAPP_APP_SECRET` env var (global, per Meta App)
- **Verify token**: `WHATSAPP_WEBHOOK_VERIFY_TOKEN` env var (chosen by operator, registered in Meta dashboard)
- **Credentials storage**: per-business in `integrations` table — `config` JSON `{ phoneNumberId, accessToken }`, `metadata` JSON `{ displayNumber, greeting, outOfHoursMessage, aiEnabled, humanHandoffEnabled }`

## Schema changes (applied via direct SQL, not drizzle-kit push)

- `enquiries`: added `channel` (text NOT NULL DEFAULT 'widget'), `whatsapp_phone` (text nullable)
- `enquiry_messages`: added `channel` (text NOT NULL DEFAULT 'widget'), `external_message_id` (text nullable)
- Indexes: `idx_enquiries_whatsapp` (partial on channel='whatsapp'), `idx_enquiry_messages_external_id` (partial on non-null)

**Why drizzle-kit push fails non-interactively**: adding a UNIQUE constraint to an existing table triggers a TTY prompt. Workaround: apply via raw SQL (`psql $DATABASE_URL`) instead.

## Key files

- `artifacts/api-server/src/services/whatsapp.ts` — `verifyWebhookSignature`, `sendTextMessage`, `downloadMedia`, `findBusinessByPhoneNumberId`
- `artifacts/api-server/src/routes/webhooks-whatsapp.ts` — GET hub verification + POST inbound handler (async, 200 immediately)
- `artifacts/api-server/src/routes/integrations.ts` — `POST /integrations/whatsapp_business/connect`, `PUT /integrations/whatsapp_business/settings`
- `artifacts/workrate/src/pages/integrations.tsx` — `WAConnectModal` component, WhatsApp connect flow

## Behaviour decisions

- Respond 200 to Meta immediately, process async (avoid retry storms)
- Business lookup: `phone_number_id` → `integrations` table scan (small N, acceptable)
- Customer lookup: `whatsapp_phone` + `owner_user_id` + `channel='whatsapp'` → most recent enquiry
- Completed conversation (description IS NOT NULL): send polite ack, don't re-run AI pipeline
- Images: download from Meta CDN → GCS (same `uploadBufferToStorage` pipeline) → vision analysis via gpt-4o-mini → stored as `[Photo: description]` in message history
- AI off (`aiEnabled: false`): store message silently, no reply
- Concept visuals: photos stored in same attachment system; tradesperson triggers from dashboard as normal

## Exports added to chat.ts

`handleEnquiryCompletion` and `getSystemPrompt` are now exported so the WhatsApp webhook can reuse them without duplication.

## rawBody capture

`app.ts` uses `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })` so all routes can access the raw body for signature verification.

## Connect UI

`WAConnectModal` in `artifacts/workrate/src/pages/integrations.tsx` collects `phoneNumberId`, `accessToken` (password field), and optional `displayNumber`. On success shows the webhook URL with a copy button and step-by-step Meta registration instructions.

**Why**: `useAuth` comes from `@clerk/react` (not `@clerk/clerk-react` which doesn't exist in this workspace).
