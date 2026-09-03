import { and, eq, sql } from "drizzle-orm";
import { billingUsageEventsTable, db } from "@workspace/db";

export async function recordUsage(input: { companyId: number; ownerUserId: string; featureCode: string; quantity?: number; idempotencyKey?: string; metadata?: Record<string, unknown> }) {
  const [event] = await db.insert(billingUsageEventsTable).values({
    ...input, quantity: input.quantity ?? 1,
  }).onConflictDoNothing().returning();
  return event;
}

export async function usageForTenant(companyId: number, ownerUserId: string) {
  return db.select({
    featureCode: billingUsageEventsTable.featureCode,
    quantity: sql<number>`sum(${billingUsageEventsTable.quantity})`,
  }).from(billingUsageEventsTable)
    .where(and(eq(billingUsageEventsTable.companyId, companyId), eq(billingUsageEventsTable.ownerUserId, ownerUserId)))
    .groupBy(billingUsageEventsTable.featureCode);
}