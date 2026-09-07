# WorkRate

WorkRate helps trade businesses manage enquiries, quotes, jobs, invoices, and finance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run init:environment -- <environment>` — explicitly initialize/verify a database marker
- `WORKRATE_ENV=development pnpm --filter @workspace/scripts run seed:synthetic-workrate -- --owner <id>` — safe synthetic fixture (development/staging only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Release environments

- Use separate development, staging, and production databases and secrets.
- Set exact `WORKRATE_ENV`; staging/production also require an immutable `WORKRATE_BUILD_ID`.
- Initialize the matching DB marker before startup. Staging and production never run startup migrations; use Replit Publish schema promotion.
- The generated staging publish URL is tested before DNS. See `docs/workrate-environment-release.md` for the full DEV → STAGING → PRODUCTION, Clerk interim model, fixture, and rollback runbook.

## Architecture decisions

- The database environment marker is immutable and checked at startup to prevent cross-environment connections.
- Production schema changes are promoted by Replit Publish, not application startup.

## Product

Enquiries, customer communications, quotes/invoices, jobs, finance, and subscription usage for trade businesses.

## Gotchas

- Never use `db push` or run migrations against staging/production.
- Never copy production data or secrets into another environment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
