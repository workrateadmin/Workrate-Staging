import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db/migrate";
import { initializeStripeBilling } from "./services/billing/provider";

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

// Run DB migrations before accepting connections
runMigrations()
  .then(async () => {
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
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed — server not started");
    process.exit(1);
  });
