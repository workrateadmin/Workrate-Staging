const environments = ["development", "staging", "production"] as const;
type DatabaseEnvironment = (typeof environments)[number];
interface DatabaseClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
  release(): void;
}

function getEnvironment(argv: readonly string[]): DatabaseEnvironment {
  const value = argv[2];
  if (!environments.includes(value as DatabaseEnvironment)) {
    throw new Error(
      "Usage: pnpm --filter @workspace/scripts run init:environment -- <development|staging|production>",
    );
  }
  return value as DatabaseEnvironment;
}

async function main(): Promise<void> {
  const environment = getEnvironment(process.argv);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const { pool } = await import("@workspace/db");
  const client: DatabaseClient = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_workrate_environment" (
        "singleton" boolean PRIMARY KEY DEFAULT true CHECK ("singleton" = true),
        "environment" text NOT NULL CHECK ("environment" IN ('development', 'staging', 'production')),
        "initialized_at" timestamp with time zone NOT NULL DEFAULT now()
      )
    `);
    const existing = await client.query<{ environment: string }>(
      `SELECT "environment" FROM "_workrate_environment" WHERE "singleton" = true FOR UPDATE`,
    );
    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO "_workrate_environment" ("singleton", "environment") VALUES (true, $1)`,
        [environment],
      );
    } else if (existing.rows.length !== 1) {
      throw new Error("Database environment marker is invalid: expected exactly one singleton row.");
    } else if (existing.rows[0]?.environment !== environment) {
      throw new Error(
        `Database is already marked "${existing.rows[0]?.environment}", not "${environment}". Markers are immutable; use the correctly targeted database.`,
      );
    }
    await client.query("COMMIT");
    process.stdout.write(`Database environment marker verified: ${environment}\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();