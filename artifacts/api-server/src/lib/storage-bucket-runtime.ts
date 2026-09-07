import { objectStorageClient } from "./objectStorage";
import {
  assertStorageBucketEnvironment,
  initializeStorageBucketEnvironment,
  STORAGE_BUCKET_MARKER_OBJECT,
  type StorageBucketBinding,
  type StorageBucketMarkerStore,
} from "./storage-bucket-binding";
import type { StorageEnvironmentConfig } from "./storage-environment";

const googleStorageMarkerStore: StorageBucketMarkerStore = {
  async read(bucketId, objectName) {
    const file = objectStorageClient.bucket(bucketId).file(objectName);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [content] = await file.download();
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