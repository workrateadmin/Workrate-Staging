import {
  assertRuntimeEnvironmentSafety,
  type WorkRateEnvironment,
} from "./runtime-environment";
import {
  getStorageEnvironmentConfig,
  resolvePrivateObjectPath,
  type StorageEnvironmentConfig,
} from "./storage-environment";
import type { StorageBucketBinding } from "./storage-bucket-binding";

type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

export type ReleaseStorageFailureCode =
  | "UNKNOWN_ENVIRONMENT"
  | "STORAGE_CONFIGURATION_INVALID"
  | "STORAGE_ENVIRONMENT_MISMATCH"
  | "BUCKET_EXPECTED_FINGERPRINT_MISSING"
  | "BUCKET_IDENTITY_MISMATCH"
  | "BUCKET_MARKER_MISSING"
  | "BUCKET_MARKER_INVALID"
  | "BUCKET_ENVIRONMENT_MISMATCH"
  | "STORAGE_BINDING_UNVERIFIED"
  | "LEGACY_STORAGE_NOT_ALLOWED"
  | "PRODUCTION_STORAGE_ACCESS_FROM_NON_PRODUCTION"
  | "DATABASE_MARKER_MISSING"
  | "DATABASE_MARKER_INVALID"
  | "DATABASE_ENVIRONMENT_MISMATCH"
  | "BUILD_ID_MISSING"
  | "BUILD_ID_MISMATCH"
  | "SOURCE_ID_INVALID";

export interface ReleaseStorageVerification {
  status: "pass" | "fail";
  checkedAt: string;
  environment: WorkRateEnvironment | null;
  buildId: string | null;
  databaseMarker: WorkRateEnvironment | null;
  storageMarker: WorkRateEnvironment | null;
  bucketFingerprint: string | null;
  bucketFingerprintStatus:
    | "matched"
    | "development-unpinned"
    | "deferred-to-startup"
    | "invalid";
  legacyCompatibility: "production-only" | "blocked";
  code: ReleaseStorageFailureCode | null;
  message: string;
}

export interface ReleaseStorageVerificationDependencies {
  verifyBucket(
    config: StorageEnvironmentConfig,
  ): Promise<StorageBucketBinding>;
  readDatabaseMarker(): Promise<{
    environment: string | null;
    rowCount: number;
  }>;
  now?: () => Date;
}

class ReleaseCheckFailure extends Error {
  constructor(
    readonly code: ReleaseStorageFailureCode,
    message: string,
  ) {
    super(message);
  }
}

function requireBuildId(
  environment: WorkRateEnvironment,
  environmentVariables: EnvironmentVariables,
  immutableSourceId?: string | null,
): string {
  const configuredBuildId = environmentVariables["WORKRATE_BUILD_ID"]?.trim();
  if (environment === "development") {
    return immutableSourceId || configuredBuildId || "local-development";
  }
  const sourceId = immutableSourceId?.trim() || configuredBuildId;
  if (!sourceId) {
    throw new ReleaseCheckFailure(
      "BUILD_ID_MISSING",
      "An immutable application source ID is required for staging and production releases.",
    );
  }
  if (!/^[a-f0-9]{40}$/.test(sourceId)) {
    throw new ReleaseCheckFailure(
      "SOURCE_ID_INVALID",
      "The immutable application source ID is malformed.",
    );
  }
  if (configuredBuildId && configuredBuildId !== sourceId) {
    throw new ReleaseCheckFailure(
      "BUILD_ID_MISMATCH",
      "WORKRATE_BUILD_ID conflicts with the immutable application source ID.",
    );
  }
  return sourceId;
}

function requireExpectedBucketFingerprint(
  environment: WorkRateEnvironment,
  environmentVariables: EnvironmentVariables,
): string | null {
  const expected =
    environmentVariables["WORKRATE_EXPECTED_STORAGE_BUCKET_FINGERPRINT"]?.trim();
  if (!expected && environment !== "development") {
    throw new ReleaseCheckFailure(
      "BUCKET_EXPECTED_FINGERPRINT_MISSING",
      "Set the expected storage bucket fingerprint for staging or production.",
    );
  }
  if (expected && !/^[a-f0-9]{12}$/.test(expected)) {
    throw new ReleaseCheckFailure(
      "BUCKET_IDENTITY_MISMATCH",
      "The expected storage bucket fingerprint is malformed.",
    );
  }
  return expected || null;
}

export function assertPinnedBucketIdentity(
  config: StorageEnvironmentConfig,
  environmentVariables: EnvironmentVariables,
): "matched" | "development-unpinned" {
  const expected = requireExpectedBucketFingerprint(
    config.environment,
    environmentVariables,
  );
  if (!expected) return "development-unpinned";
  if (expected !== config.bucketFingerprint) {
    throw new ReleaseCheckFailure(
      "BUCKET_IDENTITY_MISMATCH",
      "Configured storage bucket does not match the pinned bucket identity.",
    );
  }
  return "matched";
}

export async function validateReleaseBuildConfiguration(
  environmentVariables: EnvironmentVariables = process.env,
  now: () => Date = () => new Date(),
  immutableSourceId?: string | null,
): Promise<ReleaseStorageVerification> {
  const checkedAt = now().toISOString();
  let environment: WorkRateEnvironment | null = null;
  let buildId: string | null = null;
  let config: StorageEnvironmentConfig | null = null;

  try {
    environment = assertRuntimeEnvironmentSafety(environmentVariables);
    buildId = requireBuildId(
      environment,
      environmentVariables,
      immutableSourceId,
    );
    requireExpectedBucketFingerprint(environment, environmentVariables);
    config = getStorageEnvironmentConfig(environmentVariables);
    if (!config) {
      throw new ReleaseCheckFailure(
        "STORAGE_CONFIGURATION_INVALID",
        "Object storage build configuration is missing.",
      );
    }
    assertPathIsolation(config);

    return {
      status: "pass",
      checkedAt,
      environment,
      buildId,
      databaseMarker: null,
      storageMarker: null,
      bucketFingerprint: config.bucketFingerprint,
      bucketFingerprintStatus: "deferred-to-startup",
      legacyCompatibility:
        config.environment === "production" ? "production-only" : "blocked",
      code: null,
      message:
        "Build configuration verification passed; production resource identity is deferred to the authoritative startup gate.",
    };
  } catch (error) {
    const code = failureCodeFor(error);
    return {
      status: "fail",
      checkedAt,
      environment,
      buildId,
      databaseMarker: null,
      storageMarker: null,
      bucketFingerprint: config?.bucketFingerprint ?? null,
      bucketFingerprintStatus: "invalid",
      legacyCompatibility:
        config?.environment === "production" ? "production-only" : "blocked",
      code,
      message: safeFailureMessage(code),
    };
  }
}

function assertPathIsolation(config: StorageEnvironmentConfig): void {
  const otherEnvironments = (
    ["development", "staging", "production"] as const
  ).filter((value) => value !== config.environment);
  for (const other of otherEnvironments) {
    try {
      resolvePrivateObjectPath(`/objects/${other}/release-check`, config);
      throw new ReleaseCheckFailure(
        "PRODUCTION_STORAGE_ACCESS_FROM_NON_PRODUCTION",
        "A foreign storage namespace resolved unexpectedly.",
      );
    } catch (error) {
      if (error instanceof ReleaseCheckFailure) throw error;
      if (!(error instanceof Error) || !error.message.includes("Cross-environment")) {
        throw error;
      }
    }
  }
  if (config.environment !== "production" && config.legacyReadsAllowed) {
    throw new ReleaseCheckFailure(
      "LEGACY_STORAGE_NOT_ALLOWED",
      "Legacy storage compatibility is forbidden outside production.",
    );
  }
}

function failureCodeFor(error: unknown): ReleaseStorageFailureCode {
  if (error instanceof ReleaseCheckFailure) return error.code;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("WORKRATE_ENV")) return "UNKNOWN_ENVIRONMENT";
  if (message.includes("WORKRATE_STORAGE_ENV")) return "STORAGE_ENVIRONMENT_MISMATCH";
  return "STORAGE_CONFIGURATION_INVALID";
}

function safeFailureMessage(code: ReleaseStorageFailureCode): string {
  const messages: Record<ReleaseStorageFailureCode, string> = {
    UNKNOWN_ENVIRONMENT: "WORKRATE_ENV is missing or invalid.",
    STORAGE_CONFIGURATION_INVALID: "Storage configuration is incomplete or malformed.",
    STORAGE_ENVIRONMENT_MISMATCH: "Storage namespace does not match WORKRATE_ENV.",
    BUCKET_EXPECTED_FINGERPRINT_MISSING:
      "The expected staging/production bucket fingerprint is not configured.",
    BUCKET_IDENTITY_MISMATCH: "The configured bucket is not the pinned bucket.",
    BUCKET_MARKER_MISSING: "The bucket environment marker is missing.",
    BUCKET_MARKER_INVALID: "The bucket environment marker is invalid.",
    BUCKET_ENVIRONMENT_MISMATCH: "The bucket marker belongs to another environment.",
    STORAGE_BINDING_UNVERIFIED: "The bucket environment binding could not be verified.",
    LEGACY_STORAGE_NOT_ALLOWED: "Legacy storage compatibility is enabled outside production.",
    PRODUCTION_STORAGE_ACCESS_FROM_NON_PRODUCTION:
      "A foreign storage namespace was accessible.",
    DATABASE_MARKER_MISSING: "The database environment marker is missing.",
    DATABASE_MARKER_INVALID: "The database environment marker is invalid.",
    DATABASE_ENVIRONMENT_MISMATCH: "The database marker does not match WORKRATE_ENV.",
    BUILD_ID_MISSING: "An immutable build ID is required for this release.",
    BUILD_ID_MISMATCH:
      "The configured build ID conflicts with the immutable application source ID.",
    SOURCE_ID_INVALID: "The immutable application source ID is invalid.",
  };
  return messages[code];
}

export async function validateReleaseStorage(
  dependencies: ReleaseStorageVerificationDependencies,
  environmentVariables: EnvironmentVariables = process.env,
  immutableSourceId?: string | null,
): Promise<ReleaseStorageVerification> {
  const checkedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  let environment: WorkRateEnvironment | null = null;
  let buildId: string | null = null;
  let config: StorageEnvironmentConfig | null = null;
  let storageMarker: WorkRateEnvironment | null = null;
  let databaseMarker: WorkRateEnvironment | null = null;
  let fingerprintStatus: ReleaseStorageVerification["bucketFingerprintStatus"] =
    "invalid";

  try {
    environment = assertRuntimeEnvironmentSafety(environmentVariables);
    buildId = requireBuildId(
      environment,
      environmentVariables,
      immutableSourceId,
    );
    config = getStorageEnvironmentConfig(environmentVariables);
    if (!config) {
      throw new ReleaseCheckFailure(
        "STORAGE_CONFIGURATION_INVALID",
        "Object storage must be configured before release.",
      );
    }
    fingerprintStatus = assertPinnedBucketIdentity(config, environmentVariables);
    assertPathIsolation(config);
    try {
      const binding = await dependencies.verifyBucket(config);
      storageMarker = binding.environment;
      if (
        binding.environment !== environment ||
        binding.bucketFingerprint !== config.bucketFingerprint
      ) {
        throw new ReleaseCheckFailure(
          "STORAGE_BINDING_UNVERIFIED",
          "The verified bucket binding does not match this release.",
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("marker is missing")
      ) {
        throw new ReleaseCheckFailure(
          "BUCKET_MARKER_MISSING",
          "The bucket environment marker is missing.",
        );
      }
      if (
        error instanceof Error &&
        (error.message.includes("invalid JSON") ||
          error.message.includes("invalid shape"))
      ) {
        throw new ReleaseCheckFailure(
          "BUCKET_MARKER_INVALID",
          "The bucket environment marker is invalid.",
        );
      }
      if (
        error instanceof Error &&
        error.message.includes("bucket environment mismatch")
      ) {
        throw new ReleaseCheckFailure(
          "BUCKET_ENVIRONMENT_MISMATCH",
          "The bucket marker belongs to another environment.",
        );
      }
      if (
        error instanceof Error &&
        error.message.includes("bucket identity mismatch")
      ) {
        throw new ReleaseCheckFailure(
          "BUCKET_IDENTITY_MISMATCH",
          "The bucket marker fingerprint does not match the bucket.",
        );
      }
      throw new ReleaseCheckFailure(
        "STORAGE_BINDING_UNVERIFIED",
        "The bucket marker could not be read and verified.",
      );
    }
    const databaseMarkerRead = await dependencies.readDatabaseMarker();
    if (databaseMarkerRead.rowCount === 0) {
      throw new ReleaseCheckFailure(
        "DATABASE_MARKER_MISSING",
        "The database environment marker is missing.",
      );
    }
    if (
      databaseMarkerRead.rowCount !== 1 ||
      (databaseMarkerRead.environment !== "development" &&
        databaseMarkerRead.environment !== "staging" &&
        databaseMarkerRead.environment !== "production")
    ) {
      throw new ReleaseCheckFailure(
        "DATABASE_MARKER_INVALID",
        "The database environment marker is invalid.",
      );
    }
    databaseMarker = databaseMarkerRead.environment;
    if (databaseMarker !== environment) {
      throw new ReleaseCheckFailure(
        "DATABASE_ENVIRONMENT_MISMATCH",
        "The database marker belongs to another environment.",
      );
    }

    return {
      status: "pass",
      checkedAt,
      environment,
      buildId,
      databaseMarker,
      storageMarker,
      bucketFingerprint: config.bucketFingerprint,
      bucketFingerprintStatus: fingerprintStatus,
      legacyCompatibility:
        config.environment === "production" ? "production-only" : "blocked",
      code: null,
      message: "Release storage verification passed.",
    };
  } catch (error) {
    const code = failureCodeFor(error);
    return {
      status: "fail",
      checkedAt,
      environment,
      buildId,
      databaseMarker,
      storageMarker,
      bucketFingerprint: config?.bucketFingerprint ?? null,
      bucketFingerprintStatus: "invalid",
      legacyCompatibility:
        config?.environment === "production" ? "production-only" : "blocked",
      code,
      message: safeFailureMessage(code),
    };
  }
}