export const DATABASE_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;

export type DatabaseEnvironment = (typeof DATABASE_ENVIRONMENTS)[number];

interface QueryResult {
  rows: { environment: string }[];
}

interface DatabaseClient {
  query(query: string, values?: readonly unknown[]): Promise<QueryResult>;
}

export interface DatabaseEnvironmentMarkerRead {
  environment: string | null;
  rowCount: number;
}

/**
 * Reads the environment marker without opening a transaction or taking a lock.
 * Intended for pre-release checks that may use read-only database credentials.
 */
export async function readDatabaseEnvironmentMarker(
  client: DatabaseClient,
): Promise<DatabaseEnvironmentMarkerRead> {
  const marker = await client.query(
    `SELECT "environment" FROM "_workrate_environment" WHERE "singleton" = true`,
  );
  return {
    environment: marker.rows[0]?.environment ?? null,
    rowCount: marker.rows.length,
  };
}

/**
 * Verifies the deployment environment recorded directly in the database.
 * Marker creation is deliberately out-of-band: an application pointed at an
 * unmarked production database must never be able to label it "development".
 */
export async function assertDatabaseEnvironment(
  client: DatabaseClient,
  expectedEnvironment: DatabaseEnvironment,
): Promise<void> {
  await client.query("BEGIN");

  try {
    const marker = await client.query(
      `SELECT "environment" FROM "_workrate_environment" WHERE "singleton" = true FOR UPDATE`,
    );

    if (marker.rows.length === 0) {
      throw new Error(
        "Database environment marker is missing. Initialize it explicitly before starting WorkRate.",
      );
    } else if (marker.rows.length !== 1) {
      throw new Error(
        "Database environment marker is invalid: expected exactly one singleton row.",
      );
    } else if (marker.rows[0]?.environment !== expectedEnvironment) {
      throw new Error(
        `Database environment mismatch: database is marked "${marker.rows[0]?.environment}" but WORKRATE_ENV is "${expectedEnvironment}".`,
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}