import type { StorageEnvironmentConfig } from "./storage-environment";

export const STORAGE_BUCKET_MARKER_OBJECT =
  ".workrate/environment-binding-v1.json";

export interface StorageBucketBinding {
  schemaVersion: 1;
  environment: StorageEnvironmentConfig["environment"];
  bucketFingerprint: string;
}

export interface StorageBucketMarkerStore {
  read(bucketId: string, objectName: string): Promise<Buffer | null>;
  write(
    bucketId: string,
    objectName: string,
    content: Buffer,
  ): Promise<void>;
}

function expectedBinding(config: StorageEnvironmentConfig): StorageBucketBinding {
  return {
    schemaVersion: 1,
    environment: config.environment,
    bucketFingerprint: config.bucketFingerprint,
  };
}

function parseBinding(content: Buffer): StorageBucketBinding {
  let value: unknown;
  try {
    value = JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error("Storage bucket environment marker is invalid JSON.");
  }
  if (!value || typeof value !== "object") {
    throw new Error("Storage bucket environment marker has an invalid shape.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    (record.environment !== "development" &&
      record.environment !== "staging" &&
      record.environment !== "production") ||
    typeof record.bucketFingerprint !== "string"
  ) {
    throw new Error("Storage bucket environment marker has an invalid shape.");
  }
  return record as unknown as StorageBucketBinding;
}

export async function assertStorageBucketEnvironment(
  config: StorageEnvironmentConfig,
  store: StorageBucketMarkerStore,
): Promise<StorageBucketBinding> {
  const content = await store.read(config.bucketId, STORAGE_BUCKET_MARKER_OBJECT);
  if (!content) {
    throw new Error(
      "Storage bucket environment marker is missing. Initialize the bucket explicitly before startup.",
    );
  }
  const actual = parseBinding(content);
  const expected = expectedBinding(config);
  if (actual.environment !== expected.environment) {
    throw new Error(
      `Storage bucket environment mismatch: bucket is marked "${actual.environment}" but WORKRATE_ENV is "${expected.environment}".`,
    );
  }
  if (actual.bucketFingerprint !== expected.bucketFingerprint) {
    throw new Error(
      "Storage bucket identity mismatch: marker fingerprint does not match the configured bucket.",
    );
  }
  return actual;
}

export async function initializeStorageBucketEnvironment(
  config: StorageEnvironmentConfig,
  store: StorageBucketMarkerStore,
): Promise<StorageBucketBinding> {
  const existing = await store.read(config.bucketId, STORAGE_BUCKET_MARKER_OBJECT);
  if (existing) return assertStorageBucketEnvironment(config, store);

  const binding = expectedBinding(config);
  await store.write(
    config.bucketId,
    STORAGE_BUCKET_MARKER_OBJECT,
    Buffer.from(JSON.stringify(binding)),
  );
  return assertStorageBucketEnvironment(config, store);
}