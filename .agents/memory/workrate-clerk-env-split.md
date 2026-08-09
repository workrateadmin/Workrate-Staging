---
name: Clerk dev vs production user ID split
description: Why the same person has different userIds on dev and production, and how the widgetToken fixes it.
---

## The Rule

**Never use the Clerk userId as a persistent external identifier** (e.g. widget businessId, API token, or embed code). Clerk's Replit-managed setup uses two completely isolated user stores — dev (`pk_test_...`) and production (`pk_live_...`) — so the same person has a different userId in each environment.

**Why:** `GET /company` returning no results on production (while mobile/dev preview works) is almost always this issue. The widget businessId was `user?.id` (the Clerk userId from whichever environment the snippet was copied from), so enquiries only appear in that environment.

**How to apply:** Use a stable `widgetToken` UUID stored in the `companies` table as the external identifier. This UUID is generated once (at company creation) and is environment-agnostic.

## Architecture After Fix

- `companies.widget_token` — UUID, unique, stable across Clerk environments
- Widget snippet: `data-business-id="${company.widgetToken}"` (NOT `user.id`)
- `POST /chat/start`: resolves `businessId` as widgetToken → `company.ownerUserId`; falls back to literal userId for backward compat with old snippets
- `GET /company`: auto-creates a company (with widgetToken) if none exists for the user — covers first production login
- `claimOrphanedEnquiries(userId)`: called on auto-create; transfers enquiries from a different ownerUserId to the current user — handles the dev→production migration. Only runs when there is exactly ONE company (single-tenant guard).

## Deployment Sequence After This Fix

1. Publish the app
2. Log into production WorkRate → `GET /company` auto-creates company + generates widgetToken + claims old enquiries
3. Go to Settings → copy the new snippet (shows widgetToken, not userId)
4. Update the website widget — all future enquiries route correctly on all devices
