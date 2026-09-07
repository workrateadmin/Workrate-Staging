import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db/migrate";
import { pool } from "@workspace/db";
import { assertDatabaseEnvironment } from "@workspace/db/environment-marker";
import { initializeStripeBilling } from "./services/billing/provider";
import {
  shouldRunMigrations,
} from "./lib/runtime-environment";
import { verifyConfiguredReleaseStorage } from "./lib/release-storage-runtime";

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

async function startServer(): Promise<void> {
  const releaseStorage = await verifyConfiguredReleaseStorage();
  if (releaseStorage.status !== "pass" || !releaseStorage.environment) {
    throw new Error(
      `${releaseStorage.code ?? "STORAGE_BINDING_UNVERIFIED"}: ${releaseStorage.message}`,
    );
  }
  const workRateEnvironment = releaseStorage.environment;
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

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port, workRateEnvironment }, "Server listening");
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Startup safety checks failed — server not started");
  process.exit(1);
});
