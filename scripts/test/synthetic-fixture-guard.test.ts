import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSyntheticFixtureEnvironment,
  getSyntheticOwnerId,
} from "../src/synthetic-fixture-guard";

test("synthetic fixture refuses production and unknown environments", () => {
  assert.throws(
    () => assertSyntheticFixtureEnvironment("production"),
    /production and unknown environments are refused/,
  );
  assert.throws(() => assertSyntheticFixtureEnvironment("preview"), /permitted only/);
});

test("synthetic fixture requires an explicit owner identifier", () => {
  assert.throws(() => getSyntheticOwnerId([]), /owner identifier is required/);
  assert.equal(getSyntheticOwnerId(["--owner", "user_fixture"]), "user_fixture");
});