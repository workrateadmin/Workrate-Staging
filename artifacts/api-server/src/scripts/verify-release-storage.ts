import { pool } from "@workspace/db";
import {
  verifyConfiguredReleaseBuild,
  verifyConfiguredReleaseStorage,
} from "../lib/release-storage-runtime";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDeployableSourceIdentity } from "../../../../scripts/source-identity.mjs";

async function main(): Promise<void> {
  const buildTimeOnly = process.env.WORKRATE_ENV === "production";
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../..",
  );
  const immutableSourceId = buildTimeOnly
    ? resolveDeployableSourceIdentity({ cwd: repositoryRoot })
    : null;
  const result = buildTimeOnly
    ? await verifyConfiguredReleaseBuild(immutableSourceId!)
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