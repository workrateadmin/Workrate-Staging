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