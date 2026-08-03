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

### Codegen quirks (cumulative)
After every `orval` run on `lib/api-spec`:
1. Comment out `export * from './uploadEnquiryAttachmentBody'` in `lib/api-zod/src/generated/types/index.ts`
2. Comment out `export * from './connectIntegrationBody'` in the same file
3. Fix any `zod.looseObject({})` → `zod.object({}).passthrough()` in `lib/api-zod/src/generated/api.ts`
4. Run `pnpm exec tsc -p tsconfig.json` (not `--noEmit`) in both `lib/api-zod` AND `lib/api-client-react` to emit JS before running frontend tsc
