import { pool } from "@workspace/db";
import { readDatabaseEnvironmentMarker } from "@workspace/db/environment-marker";
import { assertConfiguredStorageBucketEnvironment } from "./storage-bucket-runtime";
import {
  validateReleaseStorage,
  type ReleaseStorageVerification,
} from "./release-storage-validation";

let latestVerification: ReleaseStorageVerification | null = null;

export async function verifyConfiguredReleaseStorage(): Promise<ReleaseStorageVerification> {
  latestVerification = await validateReleaseStorage({
    verifyBucket: assertConfiguredStorageBucketEnvironment,
    async readDatabaseMarker() {
      const client = await pool.connect();
      try {
        return await readDatabaseEnvironmentMarker(client);
      } finally {
        client.release();
      }
    },
  });
  return latestVerification;
}

export function getLatestReleaseStorageVerification(): ReleaseStorageVerification {
  if (!latestVerification) {
    throw new Error("Release storage verification has not run.");
  }
  return latestVerification;
}