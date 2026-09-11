import { objectStorageClient } from "./objectStorage";
import {
  assertStorageBucketEnvironment,
  initializeStorageBucketEnvironment,
  STORAGE_BUCKET_MARKER_OBJECT,
  type StorageBucketBinding,
  type StorageBucketMarkerStore,
} from "./storage-bucket-binding";
import type { StorageEnvironmentConfig } from "./storage-environment";

const STORAGE_MARKER_READ_TIMEOUT_MS = 10_000;

async function readStorageMarkerOperation<T>(
  operation: "file.exists" | "file.download",
  read: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  console.info(
    JSON.stringify({
      level: "info",
      event: "STORAGE_MARKER_READ_START",
      operation,
    }),
  );
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new Error(
              `STORAGE_MARKER_READ_TIMEOUT: ${operation} exceeded ${STORAGE_MARKER_READ_TIMEOUT_MS}ms.`,
            ),
          );
        }, STORAGE_MARKER_READ_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event:
          error instanceof Error &&
          error.message.startsWith("STORAGE_MARKER_READ_TIMEOUT:")
            ? "STORAGE_MARKER_READ_TIMEOUT"
            : "STORAGE_MARKER_READ_FAILED",
        operation,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    console.info(
      JSON.stringify({
        level: "info",
        event: "STORAGE_MARKER_READ_END",
        operation,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  }
}

const googleStorageMarkerStore: StorageBucketMarkerStore = {
  async read(bucketId, objectName) {
    const file = objectStorageClient.bucket(bucketId).file(objectName);
    const [exists] = await readStorageMarkerOperation("file.exists", () =>
      file.exists(),
    );
    if (!exists) return null;
    const [content] = await readStorageMarkerOperation("file.download", () =>
      file.download(),
    );
    return content;
  },
  async write(bucketId, objectName, content) {
    await objectStorageClient.bucket(bucketId).file(objectName).save(content, {
      contentType: "application/json",
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  },
};

let verifiedBinding: StorageBucketBinding | null = null;

export async function assertConfiguredStorageBucketEnvironment(
  config: StorageEnvironmentConfig,
): Promise<StorageBucketBinding> {
  verifiedBinding = await assertStorageBucketEnvironment(
    config,
    googleStorageMarkerStore,
  );
  return verifiedBinding;
}

export async function initializeConfiguredStorageBucketEnvironment(
  config: StorageEnvironmentConfig,
): Promise<StorageBucketBinding> {
  return initializeStorageBucketEnvironment(config, googleStorageMarkerStore);
}

export function getVerifiedStorageBucketBinding(): StorageBucketBinding {
  if (!verifiedBinding) {
    throw new Error("Storage bucket environment has not been verified at startup.");
  }
  return verifiedBinding;
}

export { STORAGE_BUCKET_MARKER_OBJECT };