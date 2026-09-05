import { and, eq, gte, lt, sql } from "drizzle-orm";
import { billingReceptionistTopUpPurchasesTable, billingUsageEventsTable, billingUsagePeriodsTable, billingUsageReservationsTable, billingUsageWarningsTable, companySubscriptionsTable, db } from "@workspace/db";

export type UsagePeriod = { id: number; startsAt: Date; endsAt: Date; isDevelopmentFallback: boolean };
export type UsageInput = {
  companyId: number; ownerUserId: string; featureCode: string; usageCategory: string; quantity: number; unit: string;
  source: string; providerReference?: string; relatedEntityId?: string; providerCostGbp?: string | number;
  dedupeKey: string; occurredAt?: Date; metadata?: Record<string, unknown>;
};

const monthPeriod = (now: Date) => ({
  startsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
});

/** Stripe's stored period is authoritative. Calendar periods are development-only for unbilled legacy tenants. */
export async function usagePeriodForTenant(companyId: number, ownerUserId: string, now = new Date()): Promise<UsagePeriod> {
  const [subscription] = await db.select().from(companySubscriptionsTable)
    .where(and(eq(companySubscriptionsTable.companyId, companyId), eq(companySubscriptionsTable.ownerUserId, ownerUserId))).limit(1);
  const stripePeriod = subscription?.provider === "stripe" && subscription.currentPeriodStartsAt && subscription.currentPeriodEndsAt
    ? { startsAt: subscription.currentPeriodStartsAt, endsAt: subscription.currentPeriodEndsAt, isDevelopmentFallback: false }
    : undefined;
  if (!stripePeriod && process.env.NODE_ENV !== "development") {
    throw new Error("A Stripe subscription billing period is required to meter usage.");
  }
  const period = stripePeriod ?? { ...monthPeriod(now), isDevelopmentFallback: true };
  const [stored] = await db.insert(billingUsagePeriodsTable).values({
    companyId, ownerUserId, subscriptionId: subscription?.id, startsAt: period.startsAt, endsAt: period.endsAt,
  }).onConflictDoNothing().returning();
  if (stored) return { id: stored.id, ...period };
  const [existing] = await db.select().from(billingUsagePeriodsTable).where(and(
    eq(billingUsagePeriodsTable.companyId, companyId), eq(billingUsagePeriodsTable.ownerUserId, ownerUserId),
    eq(billingUsagePeriodsTable.startsAt, period.startsAt),
  )).limit(1);
  if (!existing) throw new Error("Unable to establish usage period.");
  return { id: existing.id, ...period };
}

/** Server-only ledger writer. A deterministic key is mandatory, so replayed provider events cannot consume allowance twice. */
export async function recordUsage(input: UsageInput) {
  if (!input.dedupeKey.trim()) throw new Error("A deterministic usage dedupe key is required.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isInteger(input.quantity)) throw new Error("Usage quantity must be a positive integer.");
  const period = await usagePeriodForTenant(input.companyId, input.ownerUserId, input.occurredAt ?? new Date());
  const [event] = await db.insert(billingUsageEventsTable).values({
    ...input, usagePeriodId: period.id, periodStartsAt: period.startsAt, periodEndsAt: period.endsAt,
    idempotencyKey: input.dedupeKey, occurredAt: input.occurredAt, providerCostGbp: input.providerCostGbp?.toString(),
  }).onConflictDoNothing().returning();
  return { event, period };
}

export async function usageForTenant(companyId: number, ownerUserId: string, period?: Pick<UsagePeriod, "startsAt" | "endsAt">) {
  const where = [eq(billingUsageEventsTable.companyId, companyId), eq(billingUsageEventsTable.ownerUserId, ownerUserId)];
  if (period) where.push(gte(billingUsageEventsTable.occurredAt, period.startsAt), lt(billingUsageEventsTable.occurredAt, period.endsAt));
  return db.select({
    featureCode: billingUsageEventsTable.featureCode, usageCategory: billingUsageEventsTable.usageCategory, unit: billingUsageEventsTable.unit,
    quantity: sql<number>`coalesce(sum(${billingUsageEventsTable.quantity}), 0)`,
  }).from(billingUsageEventsTable).where(and(...where)).groupBy(billingUsageEventsTable.featureCode, billingUsageEventsTable.usageCategory, billingUsageEventsTable.unit);
}

/** Customer-facing receptionist usage is minutes, while the ledger retains exact provider seconds. */
export function allowanceQuantity(featureCode: string, rows: Array<{ featureCode: string; quantity: number; unit: string }>) {
  const matching = rows.filter((row) => row.featureCode === featureCode);
  if (featureCode !== "ai_receptionist") return matching.reduce((total, row) => total + Number(row.quantity), 0);
  const seconds = matching.reduce((total, row) => total + (row.unit === "seconds" ? Number(row.quantity) : Number(row.quantity) * 60), 0);
  return Math.ceil(seconds / 60);
}

/** Granted packs are immutable period snapshots, so plan changes/cancellation cannot revoke them early. */
export async function grantedReceptionistTopUpMinutes(companyId: number, ownerUserId: string, period: Pick<UsagePeriod, "startsAt" | "endsAt">) {
  const [row] = await db.select({ minutes: sql<number>`coalesce(sum(${billingReceptionistTopUpPurchasesTable.packMinutes}), 0)` })
    .from(billingReceptionistTopUpPurchasesTable).where(and(
      eq(billingReceptionistTopUpPurchasesTable.companyId, companyId),
      eq(billingReceptionistTopUpPurchasesTable.ownerUserId, ownerUserId),
      eq(billingReceptionistTopUpPurchasesTable.status, "granted"),
      eq(billingReceptionistTopUpPurchasesTable.periodStartsAt, period.startsAt),
      eq(billingReceptionistTopUpPurchasesTable.periodEndsAt, period.endsAt),
    ));
  return Number(row?.minutes ?? 0);
}

/**
 * Serializes allowance consumption per tenant/feature using a PostgreSQL
 * advisory transaction lock. The unique dedupe key makes provider retries
 * return the same reservation rather than reserve a second unit.
 */
export async function reserveUsage(input: {
  companyId: number; ownerUserId: string; period: UsagePeriod; featureCode: string;
  quantity: number; limit: number; dedupeKey: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${input.companyId}, hashtext(${input.featureCode}))`);
    const existing = await tx.select().from(billingUsageReservationsTable).where(and(
      eq(billingUsageReservationsTable.companyId, input.companyId),
      eq(billingUsageReservationsTable.ownerUserId, input.ownerUserId),
      eq(billingUsageReservationsTable.dedupeKey, input.dedupeKey),
    )).limit(1);
    if (existing[0]) {
      if (existing[0].status === "released") return { allowed: false as const, used: 0, reserved: 0 };
      return { allowed: true as const, reservation: existing[0], duplicate: true, used: 0, reserved: 0 };
    }
    const events = await tx.select({
      featureCode: billingUsageEventsTable.featureCode, quantity: billingUsageEventsTable.quantity, unit: billingUsageEventsTable.unit,
    }).from(billingUsageEventsTable).where(and(
      eq(billingUsageEventsTable.companyId, input.companyId), eq(billingUsageEventsTable.ownerUserId, input.ownerUserId),
      eq(billingUsageEventsTable.featureCode, input.featureCode),
      gte(billingUsageEventsTable.occurredAt, input.period.startsAt), lt(billingUsageEventsTable.occurredAt, input.period.endsAt),
    ));
    const reservations = await tx.select({ quantity: billingUsageReservationsTable.quantity }).from(billingUsageReservationsTable).where(and(
      eq(billingUsageReservationsTable.companyId, input.companyId), eq(billingUsageReservationsTable.ownerUserId, input.ownerUserId),
      eq(billingUsageReservationsTable.usagePeriodId, input.period.id), eq(billingUsageReservationsTable.featureCode, input.featureCode),
      eq(billingUsageReservationsTable.status, "reserved"),
    ));
    const used = allowanceQuantity(input.featureCode, events);
    const reserved = reservations.reduce((total, row) => total + row.quantity, 0);
    if (used + reserved + input.quantity > input.limit) return { allowed: false as const, used, reserved };
    const [reservation] = await tx.insert(billingUsageReservationsTable).values({
      companyId: input.companyId, ownerUserId: input.ownerUserId, usagePeriodId: input.period.id,
      featureCode: input.featureCode, quantity: input.quantity, dedupeKey: input.dedupeKey,
    }).returning();
    return { allowed: true as const, reservation, duplicate: false, used, reserved };
  });
}

export async function releaseUsageReservation(companyId: number, ownerUserId: string, dedupeKey: string) {
  await db.update(billingUsageReservationsTable).set({ status: "released", releasedAt: new Date() }).where(and(
    eq(billingUsageReservationsTable.companyId, companyId), eq(billingUsageReservationsTable.ownerUserId, ownerUserId),
    eq(billingUsageReservationsTable.dedupeKey, dedupeKey), eq(billingUsageReservationsTable.status, "reserved"),
  ));
}

export async function finalizeUsageReservation(companyId: number, ownerUserId: string, dedupeKey: string) {
  await db.update(billingUsageReservationsTable).set({ status: "finalized", finalizedAt: new Date() }).where(and(
    eq(billingUsageReservationsTable.companyId, companyId), eq(billingUsageReservationsTable.ownerUserId, ownerUserId),
    eq(billingUsageReservationsTable.dedupeKey, dedupeKey), eq(billingUsageReservationsTable.status, "reserved"),
  ));
}

/** Atomically claims threshold notifications; callers only notify when this returns true. */
export async function claimUsageWarning(input: { companyId: number; ownerUserId: string; usagePeriodId: number; featureCode: string; thresholdPercent: 75 | 90 | 100 }) {
  const [warning] = await db.insert(billingUsageWarningsTable).values(input).onConflictDoNothing().returning();
  return Boolean(warning);
}

/** Internal-only cost-to-serve aggregate. Null costs are intentionally not estimated. */
export async function providerCostForTenant(companyId: number, ownerUserId: string, period: Pick<UsagePeriod, "startsAt" | "endsAt">) {
  const [row] = await db.select({
    providerCostGbp: sql<string>`coalesce(sum(${billingUsageEventsTable.providerCostGbp}), 0)`,
  }).from(billingUsageEventsTable).where(and(
    eq(billingUsageEventsTable.companyId, companyId), eq(billingUsageEventsTable.ownerUserId, ownerUserId),
    gte(billingUsageEventsTable.occurredAt, period.startsAt), lt(billingUsageEventsTable.occurredAt, period.endsAt),
  ));
  return Number(row?.providerCostGbp ?? 0);
}