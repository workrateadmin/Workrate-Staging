import { pool } from "@workspace/db";
import {
  verifyConfiguredReleaseBuild,
  verifyConfiguredReleaseStorage,
} from "../lib/release-storage-runtime";

async function main(): Promise<void> {
  const buildTimeOnly = process.env.WORKRATE_ENV === "production";
  const result = buildTimeOnly
    ? await verifyConfiguredReleaseBuild()
    : await verifyConfiguredReleaseStorage();
  const summary = {
    verificationPhase: buildTimeOnly ? "build" : "full-resource",
    status: result.status.toUpperCase(),
    code: result.code,
    environment: result.environment,
    buildId: result.buildId,
    databaseMarker: result.databaseMarker,
    storageMarker: result.storageMarker,
    bucketFingerprint: result.bucketFingerprint,
    bucketFingerprintStatus: result.bucketFingerprintStatus,
    legacyCompatibility: result.legacyCompatibility,
    checkedAt: result.checkedAt,
    message: result.message,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (result.status !== "pass") process.exitCode = 1;
}

void main().finally(() => pool.end());