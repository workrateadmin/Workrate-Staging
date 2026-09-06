import assert from "node:assert/strict";
import test from "node:test";
import { canAccessOwnerDiagnostics } from "../src/services/diagnostics/authorization";

test("tenant owner can access diagnostics", () => {
  assert.equal(canAccessOwnerDiagnostics({
    authenticatedUserId: "owner-1",
    tenantOwnerUserId: "owner-1",
    isPlatformAdmin: false,
  }), true);
});

test("normal tenant user cannot access owner diagnostics", () => {
  assert.equal(canAccessOwnerDiagnostics({
    authenticatedUserId: "member-1",
    tenantOwnerUserId: "owner-1",
    isPlatformAdmin: false,
  }), false);
});

test("a user cannot access another tenant's diagnostics", () => {
  assert.equal(canAccessOwnerDiagnostics({
    authenticatedUserId: "owner-2",
    tenantOwnerUserId: "owner-1",
    isPlatformAdmin: false,
  }), false);
});

test("unauthenticated access remains denied", () => {
  assert.equal(canAccessOwnerDiagnostics({
    authenticatedUserId: null,
    tenantOwnerUserId: "owner-1",
    isPlatformAdmin: false,
  }), false);
});

test("platform administrators retain access", () => {
  assert.equal(canAccessOwnerDiagnostics({
    authenticatedUserId: "platform-admin",
    tenantOwnerUserId: null,
    isPlatformAdmin: true,
  }), true);
});