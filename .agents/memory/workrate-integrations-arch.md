---
name: WorkRate integrations architecture
description: How third-party integrations are structured — DB, backend registry, codegen quirks, and UI patterns.
---

# WorkRate Integrations Architecture

## Key decisions

### Provider registry pattern
The backend defines `INTEGRATION_PROVIDERS` as a typed constant array in `artifacts/api-server/src/routes/integrations.ts`. The `GET /integrations` endpoint merges this registry with DB rows — every provider is always visible in the catalog even when no DB row exists. New providers are added by appending to the array; no DB migration required just to show a new card.

**Why:** The catalog is code-driven (design intent, descriptions, categories) while connection state is data-driven (per-tenant, changes at runtime). Mixing them would make the catalog fragile.

**How to apply:** When building a new integration, add the provider definition to the registry first, then build the connect/disconnect logic. The UI automatically picks it up.

### DB table
`integrationsTable` in `lib/db/src/schema/integrations.ts`:
- `provider` — unique text key (e.g. "stripe", "xero", "whatsapp_business")
- `status` — "connected" | "disconnected" | "error"
- `config` — JSON string; treat as sensitive, encrypt at rest in production
- `metadata` — JSON string; non-sensitive display info safe to return in API responses
- `connectedAt` — timestamp when connection was established

### Connect/disconnect stubs
All integrations are "coming soon" — `POST /integrations/:provider/connect` returns 501. When building a real integration: replace the stub with OAuth flow or credential validation, write the row to the DB, populate `config` and `metadata`.

### Frontend provider metadata
`artifacts/workrate/src/pages/integrations.tsx` holds a `PROVIDER_META` record keyed by provider ID with brand colors, SVG icon markup, and `comingSoon: boolean`. When `comingSoon` is false and the integration is actually built, set it to false to enable the Connect button.

### Dedicated setup pages
Keep the integrations overview as a status dashboard. Configuration belongs on provider-specific routes under `/settings/integrations/*`, with legacy feature routes retained for backwards compatibility.

**Why:** Mixing credentials, instructions, testing, and connection management into overview cards makes the catalog hard to scan and especially awkward on mobile.

**How to apply:** New provider cards should navigate to a dedicated page. Reuse existing provider operations, report unsupported providers as Coming soon, and derive Connected from real provider or usage data rather than a local UI flag.

### Website widget connection state
Widget installation is confirmed by a recent loader heartbeat keyed by the stable widget token, not by enquiry existence.

**Why:** A fresh installation must be testable before any customer submits an enquiry, and testing must not create ghost enquiry data.

**How to apply:** Keep heartbeat persistence separate from chat/enquiry creation; authenticated status reads remain owner-scoped and only report recent valid loads.

### Codegen quirks (cumulative)
After every `orval` run on `lib/api-spec`:
1. Comment out `export * from './uploadEnquiryAttachmentBody'` in `lib/api-zod/src/generated/types/index.ts`
2. Comment out `export * from './connectIntegrationBody'` in the same file
3. Fix any `zod.looseObject({})` → `zod.object({}).passthrough()` in `lib/api-zod/src/generated/api.ts`
4. Run `pnpm exec tsc -p tsconfig.json` (not `--noEmit`) in both `lib/api-zod` AND `lib/api-client-react` to emit JS before running frontend tsc
