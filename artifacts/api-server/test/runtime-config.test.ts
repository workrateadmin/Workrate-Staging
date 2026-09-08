import assert from "node:assert/strict";
import test from "node:test";
import {
  getRuntimeConfig,
  LOCAL_DEVELOPMENT_BUILD_ID,
} from "../src/lib/runtime-config";

test("runtime config uses the explicit environment and build ID", () => {
  assert.deepEqual(
    getRuntimeConfig({
      WORKRATE_ENV: "staging",
      WORKRATE_BUILD_ID: "deploy-2025-01-01",
    }),
    { environment: "staging", buildId: "deploy-2025-01-01" },
  );
});

test("development has a deterministic local build ID fallback", () => {
  assert.deepEqual(
    getRuntimeConfig({ WORKRATE_ENV: "development" }),
    { environment: "development", buildId: LOCAL_DEVELOPMENT_BUILD_ID },
  );
});

test("staging and production require an explicit build ID", () => {
  for (const WORKRATE_ENV of ["staging", "production"] as const) {
    assert.throws(
      () => getRuntimeConfig({ WORKRATE_ENV }),
      /WORKRATE_BUILD_ID is required/,
    );
  }
});

test("runtime diagnostics use the embedded immutable source ID", () => {
  const sourceId = "a".repeat(40);
  assert.deepEqual(
    getRuntimeConfig({ WORKRATE_ENV: "production" }, sourceId),
    { environment: "production", buildId: sourceId },
  );
  assert.throws(
    () => getRuntimeConfig({
      WORKRATE_ENV: "production",
      WORKRATE_BUILD_ID: "b".repeat(40),
    }, sourceId),
    /conflicts with the immutable application source ID/,
  );
  assert.deepEqual(
    getRuntimeConfig({
      WORKRATE_ENV: "production",
      WORKRATE_BUILD_ID: sourceId,
    }, sourceId),
    { environment: "production", buildId: sourceId },
  );
});