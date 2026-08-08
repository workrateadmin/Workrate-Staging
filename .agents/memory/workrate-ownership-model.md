---
name: WorkRate ownership model
description: How per-user data isolation works — owner_user_id on key tables, claim-on-first-login migration pattern, widget businessId flow.
---

## Rule
Every data table must scope reads/writes by `owner_user_id` (Clerk user ID). No global `LIMIT 1` or unfiltered selects.

## Tables with owner_user_id (added 2026-08-08)
- `companies` — ownerUserId TEXT
- `enquiries` — ownerUserId TEXT (set by widget via businessId, or by dashboard Create)
- `ai_receptionist_settings` — ownerUserId TEXT
- `integrations` — ownerUserId TEXT (unique index: owner_user_id + provider, not just provider)

## Tables without owner_user_id (scoped via parent)
- `quotes`, `jobs`, `attachments`, `enquiry_messages`, `ai_calls` — accessed via enquiry ownership check

## Migration
Migration `0002_owner_user_id` in `lib/db/src/migrate.ts` — runs at server startup (idempotent). Applied to dev DB on 2026-08-08; applies to prod DB on next deploy.

## Claim-on-first-login
`company.ts` contains `claimUnownedRecords(userId)`. On first login after migration:
1. If no company with `owner_user_id = userId` is found...
2. Look for any company with `owner_user_id IS NULL` (legacy unowned record)
3. If found: claim ALL unowned companies, enquiries, ai_receptionist_settings, integrations for this user
4. This transparently migrates single-user prod data to proper ownership

**Why:** Migration adds columns as nullable; existing rows have NULL. We can't know the Clerk userId at migration time.

## Widget → businessId flow
- `widget.js` embeds `data-business-id="<clerkUserId>"` from the script tag attribute
- Widget iframe URL includes `?business_id=<userId>`
- `chat-widget.tsx` reads `business_id` from `window.location.search` in `startChat()`
- Passes it as `businessId` in the `POST /chat/start` body
- `chat.ts` saves it as `ownerUserId` on the new enquiry

**Why:** `/chat/start` is unauthenticated (public widget). The businessId in the embed snippet is the tenant identifier.

## Settings snippet
`artifacts/workrate/src/pages/settings.tsx` — snippet already includes `data-business-id="${user?.id}"`. User must copy from PUBLISHED app Settings page for prod URLs.
