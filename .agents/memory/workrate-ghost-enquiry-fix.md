---
name: Ghost enquiry fix — lazy DB creation
description: Widget chat sessions no longer create an enquiry row on open; the row is created lazily on first customer action to prevent abandoned sessions polluting the dashboard.
---

## The rule
`POST /chat/start` stores a `TempSession` in an in-memory Map — NO DB row.
The enquiry row is created by `ensureEnquiry(token)` on the first real customer action (text message or photo upload).

## Why
Abandoned sessions (widget opened, immediately closed, or automated load tests) were creating `Unknown` enquiry rows with no content, filling the dashboard.

## How to apply
- All customer-facing routes that need the enquiry MUST call `ensureEnquiry(token)` instead of a direct DB lookup. Currently: `POST /chat/:token/message` and `POST /chat/:token/upload`.
- Any NEW route that handles a first customer action must also call `ensureEnquiry` (not a raw `db.select().from(enquiriesTable)`).
- `GET /chat/:token` checks the DB first, then falls back to the temp Map to serve the greeting back to the widget.
- `TempSessions` expire after 30 minutes via a background `setInterval(...).unref()`.
- WhatsApp flow already creates enquiries on first inbound message — no change needed there.

## Zod schema change
`StartChatResponse.enquiryId` and `GetChatSessionResponse.enquiryId` (and messages[].enquiryId) are now `.nullable()` in `lib/api-zod/src/generated/api.ts`. The widget frontend never used `enquiryId` so no frontend change was needed.

## Dev cleanup
Dev IDs 55–78 (24 ghost enquiries from 2026-08-14 load test burst) were hard-deleted via targeted SQL. Production was never affected.
