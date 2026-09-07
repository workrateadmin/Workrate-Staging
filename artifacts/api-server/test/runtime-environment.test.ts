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
import {
  getStorageEnvironmentConfig,
  objectPathForNewObject,
  resolvePrivateObjectPath,
  resolvePublicObjectPaths,
} from "../src/lib/storage-environment";
import {
  assertStorageBucketEnvironment,
  initializeStorageBucketEnvironment,
  STORAGE_BUCKET_MARKER_OBJECT,
  type StorageBucketMarkerStore,
} from "../src/lib/storage-bucket-binding";

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

const developmentStorageEnvironment = {
  WORKRATE_ENV: "development",
  WORKRATE_STORAGE_ENV: "development",
  DEFAULT_OBJECT_STORAGE_BUCKET_ID: "shared-bucket",
  PRIVATE_OBJECT_DIR: "/shared-bucket/private",
  PUBLIC_OBJECT_SEARCH_PATHS: "/shared-bucket/public",
} as const;

test("storage writes always receive an environment-derived physical prefix", () => {
  const config = getStorageEnvironmentConfig(developmentStorageEnvironment);
  assert.ok(config);
  assert.equal(config.environmentObjectPrefix, "private/development");
  assert.equal(
    objectPathForNewObject("uploads/example.png", config),
    "/objects/development/uploads/example.png",
  );
  assert.deepEqual(
    resolvePrivateObjectPath("/objects/development/uploads/example.png", config),
    {
      bucketId: "shared-bucket",
      objectName: "private/development/uploads/example.png",
      legacy: false,
    },
  );
  assert.deepEqual(resolvePublicObjectPaths("logo.png", config), [{
    bucketId: "shared-bucket",
    objectName: "public/development/logo.png",
    legacy: false,
  }]);
});

test("test environments cannot read another environment or unscoped legacy objects", () => {
  const config = getStorageEnvironmentConfig(developmentStorageEnvironment);
  assert.ok(config);
  assert.throws(
    () => resolvePrivateObjectPath("/objects/production/uploads/example.png", config),
    /Cross-environment object access denied/,
  );
  assert.throws(
    () => resolvePrivateObjectPath("/objects/staging/uploads/example.png", config),
    /Cross-environment object access denied/,
  );
  assert.throws(
    () => resolvePrivateObjectPath("/objects/uploads/example.png", config),
    /allowed only in production/,
  );
  assert.throws(
    () => resolvePrivateObjectPath("/objects/development/../production/example.png", config),
    /invalid object path/,
  );
});

test("storage roots are bound to the configured bucket", () => {
  assert.throws(
    () => getStorageEnvironmentConfig({
      ...developmentStorageEnvironment,
      PRIVATE_OBJECT_DIR: "/production-bucket/private",
    }),
    /must use DEFAULT_OBJECT_STORAGE_BUCKET_ID/,
  );
});

function memoryMarkerStore(): StorageBucketMarkerStore & {
  objects: Map<string, Buffer>;
} {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    async read(bucketId, objectName) {
      return objects.get(`${bucketId}/${objectName}`) ?? null;
    },
    async write(bucketId, objectName, content) {
      const key = `${bucketId}/${objectName}`;
      if (objects.has(key)) throw new Error("marker already exists");
      objects.set(key, content);
    },
  };
}

test("bucket marker initialization is immutable and environment-bound", async () => {
  const config = getStorageEnvironmentConfig(developmentStorageEnvironment);
  assert.ok(config);
  const store = memoryMarkerStore();

  const initialized = await initializeStorageBucketEnvironment(config, store);
  assert.equal(initialized.environment, "development");
  assert.ok(store.objects.has(
    `shared-bucket/${STORAGE_BUCKET_MARKER_OBJECT}`,
  ));
  assert.deepEqual(
    await assertStorageBucketEnvironment(config, store),
    initialized,
  );

  const productionConfig = getStorageEnvironmentConfig({
    ...developmentStorageEnvironment,
    WORKRATE_ENV: "production",
    WORKRATE_STORAGE_ENV: "production",
  });
  assert.ok(productionConfig);
  await assert.rejects(
    assertStorageBucketEnvironment(productionConfig, store),
    /bucket is marked "development"/,
  );
});

test("a copied bucket marker fails when the physical bucket identity changes", async () => {
  const source = getStorageEnvironmentConfig(developmentStorageEnvironment);
  const target = getStorageEnvironmentConfig({
    ...developmentStorageEnvironment,
    DEFAULT_OBJECT_STORAGE_BUCKET_ID: "other-bucket",
    PRIVATE_OBJECT_DIR: "/other-bucket/private",
    PUBLIC_OBJECT_SEARCH_PATHS: "/other-bucket/public",
  });
  assert.ok(source);
  assert.ok(target);
  const store = memoryMarkerStore();
  const sourceStore = memoryMarkerStore();
  await initializeStorageBucketEnvironment(source, sourceStore);
  store.objects.set(
    `other-bucket/${STORAGE_BUCKET_MARKER_OBJECT}`,
    sourceStore.objects.get(
      `shared-bucket/${STORAGE_BUCKET_MARKER_OBJECT}`,
    )!,
  );
  await assert.rejects(
    assertStorageBucketEnvironment(target, store),
    /Storage bucket environment mismatch/,
  );
});