import {
  assertSyntheticFixtureEnvironment,
  getSyntheticOwnerId,
} from "./synthetic-fixture-guard";

const fixtureTag = "[workrate-synthetic-fixture-v1]";
interface DatabaseClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
  release(): void;
}

async function scalarId(
  client: DatabaseClient,
  query: string,
  values: readonly unknown[],
): Promise<number> {
  const result = await client.query<{ id: number }>(query, values);
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error("Synthetic fixture write did not return an id.");
  return id;
}

async function main(): Promise<void> {
  const environment = assertSyntheticFixtureEnvironment(process.env.WORKRATE_ENV);
  const ownerId = getSyntheticOwnerId(process.argv);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  // Keep the production refusal above this import: importing @workspace/db configures a pool.
  const { pool } = await import("@workspace/db");
  const client: DatabaseClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const marker = await client.query<{ environment: string }>(
      `SELECT "environment" FROM "_workrate_environment" WHERE "singleton" = true FOR UPDATE`,
    );
    if (marker.rows.length !== 1 || marker.rows[0]?.environment !== environment) {
      throw new Error(
        `Database environment marker must contain exactly "${environment}" before synthetic fixtures can run.`,
      );
    }

    const companyId = await scalarId(client, `
      INSERT INTO "companies" ("owner_user_id", "name", "trade_type", "service_area", "email", "widget_token")
      SELECT $1, 'Synthetic Fixture Joinery', 'Joinery', 'Fixture Town', 'fixture@example.test', $2
      WHERE NOT EXISTS (
        SELECT 1 FROM "companies" WHERE "owner_user_id" = $1 AND "name" = 'Synthetic Fixture Joinery'
      )
      RETURNING "id"
    `, [ownerId, `synthetic-${ownerId}`]).catch(async () => scalarId(client,
      `SELECT "id" FROM "companies" WHERE "owner_user_id" = $1 AND "name" = 'Synthetic Fixture Joinery' LIMIT 1`,
      [ownerId],
    ));

    const enquiryId = await scalarId(client, `
      INSERT INTO "enquiries" ("owner_user_id", "customer_name", "customer_email", "project_type", "location", "description", "status", "is_test")
      SELECT $1, 'Synthetic Customer', 'synthetic.customer@example.test', 'Built-in wardrobe', 'Fixture Town', $2, 'won', true
      WHERE NOT EXISTS (
        SELECT 1 FROM "enquiries" WHERE "owner_user_id" = $1 AND "customer_email" = 'synthetic.customer@example.test' AND "is_test" = true
      )
      RETURNING "id"
    `, [ownerId, `${fixtureTag} Synthetic test enquiry`]).catch(async () => scalarId(client,
      `SELECT "id" FROM "enquiries" WHERE "owner_user_id" = $1 AND "customer_email" = 'synthetic.customer@example.test' AND "is_test" = true LIMIT 1`,
      [ownerId],
    ));

    const quoteId = await scalarId(client, `
      INSERT INTO "quotes" ("enquiry_id", "owner_user_id", "customer_details", "project_description", "materials_allowance", "labour_allowance", "estimated_total", "vat_amount", "total_with_vat", "notes", "status", "proposal_status")
      SELECT $1, $2, 'Synthetic Customer', 'Synthetic built-in wardrobe', 400, 600, 1000, 200, 1200, $3, 'accepted', 'accepted'
      WHERE NOT EXISTS (SELECT 1 FROM "quotes" WHERE "owner_user_id" = $2 AND "notes" = $3 AND "document_type" = 'quote')
      RETURNING "id"
    `, [enquiryId, ownerId, fixtureTag]).catch(async () => scalarId(client,
      `SELECT "id" FROM "quotes" WHERE "owner_user_id" = $1 AND "notes" = $2 AND "document_type" = 'quote' LIMIT 1`,
      [ownerId, fixtureTag],
    ));

    const jobId = await scalarId(client, `
      INSERT INTO "jobs" ("enquiry_id", "quote_id", "customer_name", "customer_email", "location", "project_type", "project_description", "materials_allowance", "labour_allowance", "total_with_vat", "status", "notes")
      VALUES ($1, $2, 'Synthetic Customer', 'synthetic.customer@example.test', 'Fixture Town', 'Built-in wardrobe', 'Synthetic built-in wardrobe', 400, 600, 1200, 'In Progress', $3)
      ON CONFLICT ("enquiry_id") DO UPDATE SET "quote_id" = EXCLUDED."quote_id", "notes" = EXCLUDED."notes"
      RETURNING "id"
    `, [enquiryId, quoteId, fixtureTag]);

    await client.query(`
      INSERT INTO "quotes" ("owner_user_id", "job_id", "document_type", "invoice_number", "invoice_date", "due_date", "customer_details", "project_description", "estimated_total", "vat_amount", "total_with_vat", "notes", "status")
      SELECT $1, $2, 'invoice', $3, '2025-01-15', '2025-02-14', 'Synthetic Customer', 'Synthetic built-in wardrobe', 1000, 200, 1200, $4, 'sent'
      WHERE NOT EXISTS (SELECT 1 FROM "quotes" WHERE "owner_user_id" = $1 AND "invoice_number" = $3)
    `, [ownerId, jobId, `SYN-${companyId}-001`, fixtureTag]);

    const expenseId = await scalarId(client, `
      INSERT INTO "finance_expenses" ("company_id", "owner_user_id", "job_id", "transaction_date", "supplier_name", "description", "category", "gross_amount", "net_amount", "vat_amount", "source", "review_status", "notes", "created_by_user_id", "updated_by_user_id")
      SELECT $1, $2, $3, '2025-01-10', 'Synthetic Timber Supplies', 'Synthetic materials expense', 'materials', 120, 100, 20, 'manual', 'reviewed', $4, $2, $2
      WHERE NOT EXISTS (SELECT 1 FROM "finance_expenses" WHERE "company_id" = $1 AND "notes" = $4)
      RETURNING "id"
    `, [companyId, ownerId, jobId, fixtureTag]).catch(async () => scalarId(client,
      `SELECT "id" FROM "finance_expenses" WHERE "company_id" = $1 AND "notes" = $2 LIMIT 1`,
      [companyId, fixtureTag],
    ));

    await client.query(`
      INSERT INTO "finance_receipts" ("company_id", "owner_user_id", "expense_id", "job_id", "object_path", "original_name", "mime_type", "file_size_bytes", "content_hash", "extraction_status", "extraction_method", "extracted_data", "uploaded_by_user_id")
      VALUES ($1, $2, $3, $4, $5, 'synthetic-receipt.txt', 'text/plain', 0, $6, 'not_applicable', 'synthetic_metadata', $7::jsonb, $2)
      ON CONFLICT ("company_id", "content_hash") DO UPDATE SET "expense_id" = EXCLUDED."expense_id", "extracted_data" = EXCLUDED."extracted_data"
    `, [companyId, ownerId, expenseId, jobId, `synthetic/${ownerId}/receipt.txt`, `synthetic-receipt-${ownerId}`, JSON.stringify({ synthetic: true, fixture: "workrate-v1" })]);

    const period = await client.query<{ id: number }>(`
      INSERT INTO "billing_usage_periods" ("company_id", "owner_user_id", "starts_at", "ends_at")
      VALUES ($1, $2, '2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z')
      ON CONFLICT ("company_id", "owner_user_id", "starts_at") DO UPDATE SET "ends_at" = EXCLUDED."ends_at"
      RETURNING "id"
    `, [companyId, ownerId]);
    const usagePeriodId = period.rows[0]?.id;
    if (usagePeriodId === undefined) throw new Error("Could not create synthetic usage period.");

    await client.query(`
      INSERT INTO "company_subscriptions" ("company_id", "owner_user_id", "plan_code", "add_on_codes", "status", "provider", "provider_customer_id", "provider_subscription_id", "current_period_starts_at", "current_period_ends_at")
      VALUES ($1, $2, 'synthetic', ARRAY[]::text[], 'active', 'synthetic', $3, $4, '2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z')
      ON CONFLICT ("company_id", "owner_user_id") DO UPDATE SET "status" = EXCLUDED."status", "current_period_ends_at" = EXCLUDED."current_period_ends_at"
    `, [companyId, ownerId, `synthetic-customer-${ownerId}`, `synthetic-subscription-${ownerId}`]);
    await client.query(`
      INSERT INTO "billing_usage_events" ("company_id", "owner_user_id", "usage_period_id", "feature_code", "usage_category", "quantity", "unit", "source", "dedupe_key", "idempotency_key", "metadata", "period_starts_at", "period_ends_at")
      VALUES ($1, $2, $3, 'synthetic_fixture', 'test', 1, 'count', 'synthetic', $4, $4, $5::jsonb, '2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z')
      ON CONFLICT ("company_id", "owner_user_id", "dedupe_key") DO UPDATE SET "metadata" = EXCLUDED."metadata"
    `, [companyId, ownerId, usagePeriodId, `synthetic-fixture-${ownerId}`, JSON.stringify({ synthetic: true, fixture: "workrate-v1" })]);

    await client.query("COMMIT");
    process.stdout.write(`Synthetic WorkRate fixture verified for ${environment} owner ${ownerId}.\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();