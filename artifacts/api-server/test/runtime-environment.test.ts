import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRuntimeEnvironmentSafety,
  canSendCustomerEmail,
  canSendCustomerMessages,
  getWorkRateEnvironment,
  shouldRunMigrations,
} from "../src/lib/runtime-environment";
import { assertDatabaseEnvironment } from "@workspace/db/environment-marker";

test("WORKRATE_ENV is required and limited to known deployment environments", () => {
  assert.throws(() => getWorkRateEnvironment({}), /WORKRATE_ENV must be one of/);
  assert.throws(
    () => getWorkRateEnvironment({ WORKRATE_ENV: "preview" }),
    /WORKRATE_ENV must be one of/,
  );
  assert.equal(
    getWorkRateEnvironment({ WORKRATE_ENV: "staging" }),
    "staging",
  );
});

test("only development runs startup migrations and unknown environments fail closed", () => {
  assert.equal(shouldRunMigrations("development", {}), true);
  assert.equal(shouldRunMigrations("staging", {}), false);
  assert.equal(shouldRunMigrations("production", {}), false);
  assert.equal(shouldRunMigrations("production", {
    WORKRATE_RUN_PRODUCTION_MIGRATIONS: "true",
  }), false);
  assert.equal(shouldRunMigrations("preview", {}), false);
});

test("non-production rejects Stripe live keys and production storage namespaces", () => {
  assert.throws(
    () => assertRuntimeEnvironmentSafety({
      WORKRATE_ENV: "staging",
      STRIPE_SECRET_KEY: "sk_live_not-a-real-key",
    }),
    /Stripe live secret keys are forbidden/,
  );
  assert.throws(
    () => assertRuntimeEnvironmentSafety({
      WORKRATE_ENV: "development",
      WORKRATE_STORAGE_ENV: "development",
      PRIVATE_OBJECT_DIR: "/production-bucket/private",
    }),
    /must not reference a production storage namespace/,
  );
});

test("non-production customer communications require an explicit enablement and email allowlist", () => {
  const disabled = { WORKRATE_ENV: "development" };
  assert.equal(canSendCustomerMessages(disabled), false);
  assert.equal(canSendCustomerEmail("customer@example.test", disabled), false);

  const enabled = {
    WORKRATE_ENV: "staging",
    WORKRATE_NON_PRODUCTION_CUSTOMER_COMMS_ENABLED: "true",
    WORKRATE_NON_PRODUCTION_EMAIL_ALLOWLIST: "approved@example.test",
  };
  assert.equal(canSendCustomerMessages(enabled), true);
  assert.equal(canSendCustomerEmail("approved@example.test", enabled), true);
  assert.equal(canSendCustomerEmail("customer@example.test", enabled), false);
  assert.equal(
    canSendCustomerEmail("customer@example.test", { WORKRATE_ENV: "production" }),
    true,
  );
});

test("database environment mismatches roll back before migrations can run", async () => {
  const queries: string[] = [];
  const client = {
    async query(query: string) {
      queries.push(query);
      if (query.startsWith('SELECT "environment"')) {
        return { rows: [{ environment: "production" }] };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    assertDatabaseEnvironment(client, "staging"),
    /Database environment mismatch/,
  );
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(
    queries.some((query) => query.startsWith("COMMIT")),
    false,
  );
});

test("an unmarked database fails closed without self-identifying", async () => {
  const calls: Array<{ query: string; values?: readonly unknown[] }> = [];
  const client = {
    async query(query: string, values?: readonly unknown[]) {
      calls.push({ query, values });
      return { rows: [] };
    },
  };

  await assert.rejects(
    assertDatabaseEnvironment(client, "development"),
    /marker is missing/,
  );
  assert.equal(calls.some((call) => call.query.startsWith("INSERT INTO")), false);
  assert.equal(calls.at(-1)?.query, "ROLLBACK");
});

test("storage and HMRC configuration must match the declared environment", () => {
  assert.throws(
    () => assertRuntimeEnvironmentSafety({
      WORKRATE_ENV: "staging",
      DEFAULT_OBJECT_STORAGE_BUCKET_ID: "configured",
      WORKRATE_STORAGE_ENV: "production",
    }),
    /WORKRATE_STORAGE_ENV must match/,
  );
  assert.throws(
    () => assertRuntimeEnvironmentSafety({
      WORKRATE_ENV: "development",
      HMRC_GATEWAY_URL: "https://production-hmrc.example",
    }),
    /approved sandbox gateway origin/,
  );
});