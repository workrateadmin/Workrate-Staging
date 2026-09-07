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

**DO NOT PUBLISH unless `pnpm verify:release-storage` passes in the exact
deployment environment being promoted.** The API `prebuild` runs this same
read-only check, and `.replit` makes it the first explicit deployment build
step. A failed validation exits non-zero and blocks that publish.

1. Apply and validate schema changes in **development** only, then run
   `pnpm verify:release-storage`.
2. In staging, set `WORKRATE_EXPECTED_STORAGE_BUCKET_FINGERPRINT` to the
   independently approved fingerprint recorded when the staging bucket was
   provisioned, then run `pnpm verify:release-storage`. Never generate or replace
   this pin from the deployment's currently configured bucket during release.
3. Publish a staging build with a new exact `WORKRATE_BUILD_ID`. Replit generates
   the staging publish URL first; exercise it before adding/changing DNS.
4. Use Replit's Publish schema-diff/promotion UI to promote the reviewed schema
   to staging/production. Do not run `db push`, embedded migrations, or any
   startup DDL in staging or production. Their startup migrations are disabled.
5. Validate the generated staging URL with staging-only credentials. In the
   production deployment, use its independently provisioned expected bucket
   fingerprint and run the same read-only verification before publishing the
   exact reviewed build ID.
6. Publish through Replit and attach DNS only after the generated URL is healthy.

Keep separate Replit secrets per deployment: distinct `DATABASE_URL`, Clerk
keys, Stripe test/live keys, webhook signing secrets, object-storage namespace,
and integration credentials. Do not paste, export, or reuse production secrets
in development/staging. Replit-managed Clerk has separate development and
production stores; use the development/test store with staging-only test users
for the staging interim. Never use production Clerk identities in staging.

Object storage must set `WORKRATE_STORAGE_ENV` to the same exact value as
`WORKRATE_ENV`. WorkRate writes beneath an environment-derived physical prefix
and rejects reads carrying another environment prefix. Historical unprefixed
object paths are readable only in production for migration compatibility; new
writes are always scoped.

Each physical bucket must also contain its immutable environment marker before
the API starts:

```sh
pnpm --filter @workspace/scripts run init:storage-environment
# Production additionally requires: -- --confirm-production
```

The marker records the environment and a non-secret bucket fingerprint. Startup
fails if the marker is missing, copied from another bucket, or belongs to a
different environment.

`verify:release-storage` reads only configuration, the DB marker, and the fixed
bucket marker. It never lists, reads, copies, or modifies customer objects. It
also verifies namespace isolation, production-only legacy compatibility,
provider/environment guards, and the immutable build ID. A successful marker
read proves access to the intended bucket, but Replit's build cannot prove that
the underlying service identity lacks IAM access to every other bucket; keep
deployment identities and bucket IAM separate as an independent control.

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