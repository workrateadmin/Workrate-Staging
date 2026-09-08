import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db/migrate";
import { pool } from "@workspace/db";
import { assertDatabaseEnvironment } from "@workspace/db/environment-marker";
import { initializeStripeBilling } from "./services/billing/provider";
import {
  shouldRunMigrations,
} from "./lib/runtime-environment";
import {
  verifyConfiguredReleaseStorage,
} from "./lib/release-storage-runtime";
import {
  runAfterStartupResourceIdentityGate,
  StartupResourceIdentityGateError,
} from "./lib/startup-resource-identity-gate";

function emitBootStage(event: string, message: string): void {
  process.stdout.write(`${JSON.stringify({ level: "info", event, message })}\n`);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

emitBootStage("BOOT_STAGE_2", "imports and configuration loaded");

async function startServer(): Promise<void> {
  emitBootStage("BOOT_STAGE_3", "before startup resource gate");
  await runAfterStartupResourceIdentityGate(
    verifyConfiguredReleaseStorage,
    async (releaseStorage) => {
      emitBootStage("BOOT_STAGE_4", "after startup resource gate");
      const workRateEnvironment = releaseStorage.environment!;
      logger.info(
        {
          startupGate: "PASS",
          environment: workRateEnvironment,
          buildId: releaseStorage.buildId,
          bucketFingerprintStatus: releaseStorage.bucketFingerprintStatus,
          storageMarker: releaseStorage.storageMarker,
          databaseMarker: releaseStorage.databaseMarker,
        },
        "Startup resource identity gate passed",
      );
      const client = await pool.connect();
      try {
        await assertDatabaseEnvironment(client, workRateEnvironment);
      } finally {
        client.release();
      }

      if (shouldRunMigrations(workRateEnvironment)) {
        await runMigrations();
      } else {
        logger.info(
          { workRateEnvironment },
          "Automatic database migrations are disabled for this environment",
        );
      }

      try {
        await initializeStripeBilling();
      } catch (err) {
        // Billing calls remain safely unavailable until the connector recovers;
        // never take unrelated product functionality down for a transient sync error.
        logger.error({ err }, "Stripe initialization failed; billing provider will remain unavailable");
      }

      emitBootStage("BOOT_STAGE_5", "before server listen");
      app.listen(port, (err) => {
        if (err) {
          logger.error({ err }, "Error listening on port");
          process.exit(1);
        }
        emitBootStage("BOOT_STAGE_6", "server listen callback reached");
        logger.info({ port, workRateEnvironment }, "Server listening");
      });
    },
  );
}

startServer().catch((err) => {
  if (err instanceof StartupResourceIdentityGateError) {
    const releaseStorage = err.verification;
    logger.error(
      {
        startupGate: "FAIL",
        environment: releaseStorage.environment,
        buildId: releaseStorage.buildId,
        bucketFingerprint: releaseStorage.bucketFingerprint,
        bucketFingerprintStatus: releaseStorage.bucketFingerprintStatus,
        storageMarker: releaseStorage.storageMarker,
        databaseMarker: releaseStorage.databaseMarker,
        code: releaseStorage.code,
      },
      "Production startup resource identity gate failed",
    );
  } else {
    logger.error({ err }, "Startup safety checks failed — server not started");
  }
  process.exit(1);
});
