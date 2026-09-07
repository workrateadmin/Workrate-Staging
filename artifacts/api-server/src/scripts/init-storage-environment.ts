import { requireStorageEnvironmentConfig } from "../lib/storage-environment";
import { initializeConfiguredStorageBucketEnvironment } from "../lib/storage-bucket-runtime";
import { assertPinnedBucketIdentity } from "../lib/release-storage-validation";

const environments = ["development", "staging", "production"] as const;

async function main(): Promise<void> {
  const environment = process.env.WORKRATE_ENV;
  if (!environments.includes(environment as (typeof environments)[number])) {
    throw new Error("WORKRATE_ENV must be exactly development, staging, or production.");
  }
  if (
    environment === "production" &&
    !process.argv.includes("--confirm-production")
  ) {
    throw new Error(
      "Production bucket initialization requires --confirm-production while connected to the intended production deployment.",
    );
  }
  if (process.env.WORKRATE_STORAGE_ENV !== environment) {
    throw new Error("WORKRATE_STORAGE_ENV must exactly match WORKRATE_ENV.");
  }

  const config = requireStorageEnvironmentConfig();
  assertPinnedBucketIdentity(config, process.env);
  const binding = await initializeConfiguredStorageBucketEnvironment(config);
  process.stdout.write(
    `Storage bucket marker verified for ${binding.environment} (${binding.bucketFingerprint}).\n`,
  );
}

void main();