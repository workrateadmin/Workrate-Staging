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
import { validateReleaseStorage } from "../src/lib/release-storage-validation";

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
    /Storage bucket identity mismatch/,
  );
});

test("release validation classifies a real copied marker as a bucket identity mismatch", async () => {
  const sourceVariables = releaseEnvironment("development");
  const targetVariables = {
    ...sourceVariables,
    DEFAULT_OBJECT_STORAGE_BUCKET_ID: "replacement-development-bucket",
    PRIVATE_OBJECT_DIR: "/replacement-development-bucket/private",
    PUBLIC_OBJECT_SEARCH_PATHS: "/replacement-development-bucket/public",
  };
  const source = getStorageEnvironmentConfig(sourceVariables);
  const target = getStorageEnvironmentConfig(targetVariables);
  assert.ok(source);
  assert.ok(target);
  const sourceStore = memoryMarkerStore();
  const targetStore = memoryMarkerStore();
  await initializeStorageBucketEnvironment(source, sourceStore);
  targetStore.objects.set(
    `replacement-development-bucket/${STORAGE_BUCKET_MARKER_OBJECT}`,
    sourceStore.objects.get(
      `development-bucket/${STORAGE_BUCKET_MARKER_OBJECT}`,
    )!,
  );

  const result = await validateReleaseStorage({
    verifyBucket: (config) => assertStorageBucketEnvironment(config, targetStore),
    async readDatabaseMarker() {
      return { environment: "development", rowCount: 1 };
    },
  }, targetVariables);
  assert.equal(result.status, "fail");
  assert.equal(result.code, "BUCKET_IDENTITY_MISMATCH");
});

function releaseEnvironment(
  environment: "development" | "staging" | "production",
): Record<string, string> {
  const variables: Record<string, string> = {
    WORKRATE_ENV: environment,
    WORKRATE_STORAGE_ENV: environment,
    DEFAULT_OBJECT_STORAGE_BUCKET_ID: `${environment}-bucket`,
    PRIVATE_OBJECT_DIR: `/${environment}-bucket/private`,
    PUBLIC_OBJECT_SEARCH_PATHS: `/${environment}-bucket/public`,
    WORKRATE_BUILD_ID:
      environment === "development" ? "local-development" : `release-${environment}`,
  };
  const config = getStorageEnvironmentConfig(variables);
  assert.ok(config);
  if (environment !== "development") {
    variables.WORKRATE_EXPECTED_STORAGE_BUCKET_FINGERPRINT =
      config.bucketFingerprint;
  }
  return variables;
}

function passingReleaseDependencies(
  variables: Record<string, string>,
  overrides: Partial<{
    storageMarker: "development" | "staging" | "production";
    bucketFingerprint: string;
    databaseFailure: Error;
    databaseMarker: string | null;
    databaseRowCount: number;
    bucketFailure: Error;
  }> = {},
) {
  const config = getStorageEnvironmentConfig(variables);
  assert.ok(config);
  return {
    now: () => new Date("2026-09-07T12:00:00.000Z"),
    async verifyBucket() {
      if (overrides.bucketFailure) throw overrides.bucketFailure;
      if (
        overrides.storageMarker &&
        overrides.storageMarker !== config.environment
      ) {
        throw new Error(
          `Storage bucket environment mismatch: bucket is marked "${overrides.storageMarker}" but WORKRATE_ENV is "${config.environment}".`,
        );
      }
      if (
        overrides.bucketFingerprint &&
        overrides.bucketFingerprint !== config.bucketFingerprint
      ) {
        throw new Error("Storage bucket identity mismatch.");
      }
      return {
        schemaVersion: 1 as const,
        environment: config.environment,
        bucketFingerprint: config.bucketFingerprint,
      };
    },
    async readDatabaseMarker() {
      if (overrides.databaseFailure) throw overrides.databaseFailure;
      return {
        environment: overrides.databaseMarker === undefined
          ? config.environment
          : overrides.databaseMarker,
        rowCount: overrides.databaseRowCount ?? 1,
      };
    },
  };
}

for (const environment of ["development", "staging", "production"] as const) {
  test(`${environment} release storage validation passes for its bound bucket`, async () => {
    const variables = releaseEnvironment(environment);
    const result = await validateReleaseStorage(
      passingReleaseDependencies(variables),
      variables,
    );
    assert.equal(result.status, "pass");
    assert.equal(result.environment, environment);
    assert.equal(result.databaseMarker, environment);
    assert.equal(result.storageMarker, environment);
  });
}

test("release validation rejects cross-environment buckets in both directions", async () => {
  for (const [environment, marker] of [
    ["development", "production"],
    ["staging", "production"],
    ["production", "staging"],
    ["production", "development"],
  ] as const) {
    const variables = releaseEnvironment(environment);
    const result = await validateReleaseStorage(
      passingReleaseDependencies(variables, { storageMarker: marker }),
      variables,
    );
    assert.equal(result.status, "fail");
    assert.equal(result.code, "BUCKET_ENVIRONMENT_MISMATCH");
  }
});

test("release validation rejects missing, malformed, and unverified bucket bindings", async () => {
  const variables = releaseEnvironment("staging");
  for (const bucketFailure of [
    new Error("Storage bucket environment marker is missing."),
    new Error("Storage bucket environment marker is invalid JSON."),
  ]) {
    const result = await validateReleaseStorage(
      passingReleaseDependencies(variables, { bucketFailure }),
      variables,
    );
    assert.equal(result.status, "fail");
  }
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(variables, {
        bucketFailure: new Error("Storage bucket environment marker is missing."),
      }),
      variables,
    )).code,
    "BUCKET_MARKER_MISSING",
  );
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(variables, {
        bucketFailure: new Error("Storage bucket environment marker has an invalid shape."),
      }),
      variables,
    )).code,
    "BUCKET_MARKER_INVALID",
  );
  const unverified = await validateReleaseStorage(
    passingReleaseDependencies(variables, {
      bucketFailure: new Error("Storage credentials unavailable"),
    }),
    variables,
  );
  assert.equal(unverified.code, "STORAGE_BINDING_UNVERIFIED");
});

test("release validation requires and matches staging/production fingerprint pins", async () => {
  const missing = releaseEnvironment("staging");
  delete missing.WORKRATE_EXPECTED_STORAGE_BUCKET_FINGERPRINT;
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(missing),
      missing,
    )).code,
    "BUCKET_EXPECTED_FINGERPRINT_MISSING",
  );

  const wrong = releaseEnvironment("production");
  wrong.WORKRATE_EXPECTED_STORAGE_BUCKET_FINGERPRINT = "000000000000";
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(wrong),
      wrong,
    )).code,
    "BUCKET_IDENTITY_MISMATCH",
  );
});

test("release validation rejects malformed namespaces, unknown environments, and DB mismatches", async () => {
  const malformed = releaseEnvironment("staging");
  malformed.PRIVATE_OBJECT_DIR = "/staging-bucket/private/../production";
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(releaseEnvironment("staging")),
      malformed,
    )).code,
    "STORAGE_CONFIGURATION_INVALID",
  );

  const unknown = { ...releaseEnvironment("development"), WORKRATE_ENV: "test" };
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(releaseEnvironment("development")),
      unknown,
    )).code,
    "UNKNOWN_ENVIRONMENT",
  );

  const production = releaseEnvironment("production");
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(production, {
        databaseMarker: "staging",
      }),
      production,
    )).databaseMarker,
    "staging",
  );
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(production, {
        databaseMarker: "staging",
      }),
      production,
    )).code,
    "DATABASE_ENVIRONMENT_MISMATCH",
  );
});

test("release validation reports missing and invalid database markers precisely", async () => {
  const staging = releaseEnvironment("staging");
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(staging, {
        databaseMarker: null,
        databaseRowCount: 0,
      }),
      staging,
    )).code,
    "DATABASE_MARKER_MISSING",
  );
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(staging, {
        databaseMarker: "staging",
        databaseRowCount: 2,
      }),
      staging,
    )).code,
    "DATABASE_MARKER_INVALID",
  );
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(staging, {
        databaseMarker: "preview",
      }),
      staging,
    )).code,
    "DATABASE_MARKER_INVALID",
  );
});

test("release validation rejects missing build IDs and unsafe provider modes", async () => {
  const missingBuild = releaseEnvironment("staging");
  delete missingBuild.WORKRATE_BUILD_ID;
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(releaseEnvironment("staging")),
      missingBuild,
    )).code,
    "BUILD_ID_MISSING",
  );

  const liveStripe = {
    ...releaseEnvironment("staging"),
    STRIPE_SECRET_KEY: "sk_live_not-a-real-key",
  };
  assert.equal(
    (await validateReleaseStorage(
      passingReleaseDependencies(releaseEnvironment("staging")),
      liveStripe,
    )).status,
    "fail",
  );
});

test("legacy compatibility is blocked in test environments and remains production-bucket scoped", () => {
  for (const environment of ["development", "staging"] as const) {
    const config = getStorageEnvironmentConfig(releaseEnvironment(environment));
    assert.ok(config);
    assert.equal(config.legacyReadsAllowed, false);
    assert.throws(
      () => resolvePrivateObjectPath("/objects/uploads/legacy.png", config),
      /allowed only in production/,
    );
  }

  const production = getStorageEnvironmentConfig(releaseEnvironment("production"));
  assert.ok(production);
  assert.equal(production.legacyReadsAllowed, true);
  assert.deepEqual(
    resolvePrivateObjectPath("/objects/uploads/legacy.png", production),
    {
      bucketId: "production-bucket",
      objectName: "private/uploads/legacy.png",
      legacy: true,
    },
  );
});