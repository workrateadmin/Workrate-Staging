# WorkRate environment release operations

WorkRate has three deliberately separate deployments and databases: `development`,
`staging`, and `production`. Set `WORKRATE_ENV` exactly to one of those values in
each deployment. Set `WORKRATE_BUILD_ID` to the immutable source commit/build
identifier in staging and production; record that same value in the release
notes and rollback decision. Development may use `local-development`.

## First use and DB markers

Each database must be independently provisioned and marked **before** its API
starts. From a shell connected to that database, run:

```sh
pnpm --filter @workspace/scripts run init:environment -- development
# or: staging / production, only while connected to that exact database
```

The marker is a one-row `_workrate_environment` table and is immutable. Startup
fails if it is missing, malformed, or differs from `WORKRATE_ENV`. Never point a
non-production deployment at a production database, and never copy production
data into development or staging.

## DEV → STAGING → PRODUCTION

1. Apply and validate schema changes in **development** only.
2. Publish a staging build with a new exact `WORKRATE_BUILD_ID`. Replit generates
   the staging publish URL first; exercise it before adding/changing DNS.
3. Use Replit's Publish schema-diff/promotion UI to promote the reviewed schema
   to staging/production. Do not run `db push`, embedded migrations, or any
   startup DDL in staging or production. Their startup migrations are disabled.
4. Validate the generated staging URL with staging-only credentials and then
   publish the same reviewed build ID to production through Replit. Attach DNS
   only after the generated URL is healthy.

Keep separate Replit secrets per deployment: distinct `DATABASE_URL`, Clerk
keys, Stripe test/live keys, webhook signing secrets, object-storage namespace,
and integration credentials. Do not paste, export, or reuse production secrets
in development/staging. Replit-managed Clerk has separate development and
production stores; use the development/test store with staging-only test users
for the staging interim. Never use production Clerk identities in staging.

## Rollback

Record the previously healthy immutable build ID before each publish. To roll
back, republish that prior build through Replit, verify the database marker and
deployment secrets still match, then smoke-test the generated URL before DNS
changes. Schema changes must be backward-compatible for the rollback window;
Replit Publish owns schema promotion, so do not attempt a startup or ad-hoc
production schema rollback.

## Synthetic fixtures

The repository-only fixture has no HTTP endpoint and never reads/copies
production. It is intentionally limited to marked development/staging databases:

```sh
WORKRATE_ENV=staging pnpm --filter @workspace/scripts run seed:synthetic-workrate -- --owner user_staging_fixture
```

It requires the matching DB marker and an explicit owner ID, refuses production
and unknown environments before opening a database connection, and is idempotent.
It creates/updates tagged synthetic business, enquiry, quote, job, invoice,
expense, receipt metadata, subscription, usage period, and usage event records.