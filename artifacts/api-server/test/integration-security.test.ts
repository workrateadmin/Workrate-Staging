import assert from "node:assert/strict";
import test from "node:test";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../src/lib/integration-secret";
import { isRecentWidgetHeartbeat, safeWidgetSiteOrigin } from "../src/lib/widget-heartbeat";
import { parseWhatsAppConfig } from "../src/services/whatsapp";

process.env.SESSION_SECRET ??= "integration-security-regression-secret";

test("integration secrets use authenticated encryption and do not retain plaintext", () => {
  const plaintext = "meta-access-token-test-value";
  const encrypted = encryptIntegrationSecret(plaintext);
  assert.match(encrypted, /^v1\./);
  assert.equal(encrypted.includes(plaintext), false);
  assert.equal(decryptIntegrationSecret(encrypted), plaintext);
});

test("WhatsApp config decrypts current rows and safely backfills legacy plaintext rows", () => {
  const legacy = parseWhatsAppConfig(JSON.stringify({
    phoneNumberId: "phone-1",
    accessToken: "legacy-token",
  }));
  assert.deepEqual(legacy.config, { phoneNumberId: "phone-1", accessToken: "legacy-token" });
  assert.ok(legacy.migratedConfig);
  assert.equal(legacy.migratedConfig.includes("legacy-token"), false);

  const migrated = parseWhatsAppConfig(legacy.migratedConfig);
  assert.deepEqual(migrated.config, { phoneNumberId: "phone-1", accessToken: "legacy-token" });
  assert.equal(migrated.migratedConfig, null);
});

test("widget heartbeat accepts web origins and expires without creating enquiry state", () => {
  const now = Date.parse("2026-09-02T18:00:00.000Z");
  assert.equal(safeWidgetSiteOrigin("https://example.com/path?q=1"), "https://example.com");
  assert.equal(safeWidgetSiteOrigin("javascript:alert(1)"), null);
  assert.equal(isRecentWidgetHeartbeat("2026-09-02T17:50:00.000Z", now), true);
  assert.equal(isRecentWidgetHeartbeat("2026-09-02T17:40:00.000Z", now), false);
});