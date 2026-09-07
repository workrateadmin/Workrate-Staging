import { createHash } from "node:crypto";
import {
  getWorkRateEnvironment,
  type WorkRateEnvironment,
} from "./runtime-environment";

type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

export interface StorageRoot {
  bucketId: string;
  objectPrefix: string;
}

export interface StorageEnvironmentConfig {
  environment: WorkRateEnvironment;
  bucketId: string;
  bucketFingerprint: string;
  privateRoot: StorageRoot;
  publicRoots: StorageRoot[];
  environmentObjectPrefix: string;
  objectPathPrefix: string;
  legacyReadsAllowed: boolean;
}

function cleanRelativePath(value: string, label: string): string {
  const decoded = decodeURIComponent(value).replace(/^\/+|\/+$/g, "");
  if (
    !decoded ||
    decoded.includes("\\") ||
    decoded.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${label} contains an invalid object path.`);
  }
  return decoded;
}

function parseRoot(value: string, label: string): StorageRoot {
  const clean = cleanRelativePath(value, label);
  const [bucketId, ...prefixParts] = clean.split("/");
  if (!bucketId || prefixParts.length === 0) {
    throw new Error(`${label} must include a bucket and object prefix.`);
  }
  return { bucketId, objectPrefix: prefixParts.join("/") };
}

export function getStorageEnvironmentConfig(
  environmentVariables: EnvironmentVariables = process.env,
): StorageEnvironmentConfig | null {
  const configuredValues = [
    environmentVariables["DEFAULT_OBJECT_STORAGE_BUCKET_ID"],
    environmentVariables["PRIVATE_OBJECT_DIR"],
    environmentVariables["PUBLIC_OBJECT_SEARCH_PATHS"],
  ];
  if (configuredValues.every((value) => !value?.trim())) return null;
  if (configuredValues.some((value) => !value?.trim())) {
    throw new Error("Object storage configuration is incomplete.");
  }

  const environment = getWorkRateEnvironment(environmentVariables);
  if (environmentVariables["WORKRATE_STORAGE_ENV"] !== environment) {
    throw new Error("WORKRATE_STORAGE_ENV must exactly match WORKRATE_ENV.");
  }

  const bucketId = environmentVariables["DEFAULT_OBJECT_STORAGE_BUCKET_ID"]!.trim();
  const privateRoot = parseRoot(
    environmentVariables["PRIVATE_OBJECT_DIR"]!,
    "PRIVATE_OBJECT_DIR",
  );
  const publicRoots = environmentVariables["PUBLIC_OBJECT_SEARCH_PATHS"]!
    .split(",")
    .map((value) => parseRoot(value.trim(), "PUBLIC_OBJECT_SEARCH_PATHS"));

  for (const root of [privateRoot, ...publicRoots]) {
    if (root.bucketId !== bucketId) {
      throw new Error("All storage roots must use DEFAULT_OBJECT_STORAGE_BUCKET_ID.");
    }
  }

  return {
    environment,
    bucketId,
    bucketFingerprint: createHash("sha256").update(bucketId).digest("hex").slice(0, 12),
    privateRoot,
    publicRoots,
    environmentObjectPrefix: `${privateRoot.objectPrefix}/${environment}`,
    objectPathPrefix: `/objects/${environment}/`,
    legacyReadsAllowed: environment === "production",
  };
}

export function requireStorageEnvironmentConfig(
  environmentVariables: EnvironmentVariables = process.env,
): StorageEnvironmentConfig {
  const config = getStorageEnvironmentConfig(environmentVariables);
  if (!config) throw new Error("Object storage is not configured.");
  return config;
}

export function resolvePrivateObjectPath(
  objectPath: string,
  config = requireStorageEnvironmentConfig(),
): { bucketId: string; objectName: string; legacy: boolean } {
  if (!objectPath.startsWith("/objects/")) {
    throw new Error("Object path must start with /objects/.");
  }
  const entityId = cleanRelativePath(
    objectPath.slice("/objects/".length),
    "objectPath",
  );
  const [declaredEnvironment, ...rest] = entityId.split("/");

  if (
    declaredEnvironment === "development" ||
    declaredEnvironment === "staging" ||
    declaredEnvironment === "production"
  ) {
    if (declaredEnvironment !== config.environment || rest.length === 0) {
      throw new Error("Cross-environment object access denied.");
    }
    return {
      bucketId: config.bucketId,
      objectName: `${config.environmentObjectPrefix}/${rest.join("/")}`,
      legacy: false,
    };
  }

  if (!config.legacyReadsAllowed) {
    throw new Error("Unscoped legacy object access is allowed only in production.");
  }
  return {
    bucketId: config.bucketId,
    objectName: `${config.privateRoot.objectPrefix}/${entityId}`,
    legacy: true,
  };
}

export function objectPathForNewObject(
  relativePath: string,
  config = requireStorageEnvironmentConfig(),
): string {
  return `${config.objectPathPrefix}${cleanRelativePath(relativePath, "relativePath")}`;
}

export function resolvePublicObjectPaths(
  filePath: string,
  config = requireStorageEnvironmentConfig(),
): Array<{ bucketId: string; objectName: string; legacy: boolean }> {
  const relativePath = cleanRelativePath(filePath, "public object path");
  const scoped = config.publicRoots.map((root) => ({
    bucketId: root.bucketId,
    objectName: `${root.objectPrefix}/${config.environment}/${relativePath}`,
    legacy: false,
  }));
  if (!config.legacyReadsAllowed) return scoped;
  return [
    ...scoped,
    ...config.publicRoots.map((root) => ({
      bucketId: root.bucketId,
      objectName: `${root.objectPrefix}/${relativePath}`,
      legacy: true,
    })),
  ];
}

export function assertStorageFileBelongsToEnvironment(
  bucketId: string,
  objectName: string,
  config = requireStorageEnvironmentConfig(),
): void {
  if (bucketId !== config.bucketId) {
    throw new Error("Cross-bucket object access denied.");
  }
  const scopedPrefixes = [
    `${config.environmentObjectPrefix}/`,
    ...config.publicRoots.map((root) => `${root.objectPrefix}/${config.environment}/`),
  ];
  if (scopedPrefixes.some((prefix) => objectName.startsWith(prefix))) return;
  if (
    config.legacyReadsAllowed &&
    [config.privateRoot, ...config.publicRoots].some(
      (root) => objectName.startsWith(`${root.objectPrefix}/`),
    )
  ) return;
  throw new Error("Cross-environment object access denied.");
}