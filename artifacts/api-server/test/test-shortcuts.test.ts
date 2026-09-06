import assert from "node:assert/strict";
import test from "node:test";
import { areTestShortcutsEnabled } from "../src/services/testing/shortcuts";

test("production always disables test shortcuts", () => {
  assert.equal(areTestShortcutsEnabled({
    WORKRATE_ENV: "production",
    NODE_ENV: "development",
    WORKRATE_ENABLE_TEST_SHORTCUTS: "true",
  }), false);
});

test("NODE_ENV production disables test shortcuts when WORKRATE_ENV is absent", () => {
  assert.equal(areTestShortcutsEnabled({
    NODE_ENV: "production",
    WORKRATE_ENV: undefined,
    WORKRATE_ENABLE_TEST_SHORTCUTS: "true",
  }), false);
});

test("staging requires explicit opt-in", () => {
  assert.equal(areTestShortcutsEnabled({
    WORKRATE_ENV: "staging",
    NODE_ENV: "production",
    WORKRATE_ENABLE_TEST_SHORTCUTS: undefined,
  }), false);
  assert.equal(areTestShortcutsEnabled({
    WORKRATE_ENV: "staging",
    NODE_ENV: "production",
    WORKRATE_ENABLE_TEST_SHORTCUTS: "true",
  }), true);
});

test("development remains available unless explicitly disabled", () => {
  assert.equal(areTestShortcutsEnabled({
    WORKRATE_ENV: "development",
    NODE_ENV: "development",
    WORKRATE_ENABLE_TEST_SHORTCUTS: undefined,
  }), true);
  assert.equal(areTestShortcutsEnabled({
    WORKRATE_ENV: "development",
    NODE_ENV: "development",
    WORKRATE_ENABLE_TEST_SHORTCUTS: "false",
  }), false);
});

test("unknown environments fail closed", () => {
  assert.equal(areTestShortcutsEnabled({
    WORKRATE_ENV: undefined,
    NODE_ENV: "test",
    WORKRATE_ENABLE_TEST_SHORTCUTS: "true",
  }), false);
});