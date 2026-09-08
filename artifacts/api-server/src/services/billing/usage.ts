import { and, eq, gte, lt, sql } from "drizzle-orm";
import { billingReceptionistTopUpPurchasesTable, billingUsageEventsTable, billingUsagePeriodsTable, billingUsageReservationsTable, billingUsageWarningsTable, companiesTable, companySubscriptionsTable, db } from "@workspace/db";

export type UsagePeriod = { id: number; startsAt: Date; endsAt: Date; isDevelopmentFallback: boolean };
export type UsageInput = {
  companyId: number; ownerUserId: string; featureCode: string; usageCategory: string; quantity: number; unit: string;
  source: string; providerReference?: string; relatedEntityId?: string; providerCostGbp?: string | number;
  providerCostAmount?: string | number | null; providerCostCurrency?: string | null;
  dedupeKey: string; occurredAt?: Date; metadata?: Record<string, unknown>;
};

/** Prevent legacy Vapi duration cost columns from being counted beside canonical cost receipts. */
export function isLegacyVapiCostCoveredByCanonical(
  event: { source: string; usageCategory: string; providerReference: string | null },
  canonicalReferences: ReadonlySet<string | null>,
): boolean {
  return event.source === "vapi" && event.usageCategory !== "vapi_provider_cost"
    && Boolean(event.providerReference) && canonicalReferences.has(event.providerReference);
}

export type ProviderCostHistoryEvent = {
  providerReference: string | null; source: string; usageCategory: string;
  occurredAt?: Date;
  providerCostAmount: string | number | null; providerCostCurrency: string | null; providerCostGbp: string | number | null;
};
/** Pure internal-reporting calculation; missing/unknown currency never becomes a £0 margin. */
export function summarizeProviderCosts(events: ProviderCostHistoryEvent[], revenueGbp: number) {
  const canonical = new Set(events.filter((event) => event.usageCategory === "vapi_provider_cost").map((event) => event.providerReference));
  const verified = events.filter((event) => (event.usageCategory === "vapi_provider_cost" || event.providerCostAmount != null || event.providerCostGbp != null)
    && !isLegacyVapiCostCoveredByCanonical(event, canonical));
  const uncaptured = events.some((event) => event.providerReference && event.source !== "server"
    && event.providerCostAmount == null && event.providerCostGbp == null
    && !(event.source === "vapi" && canonical.has(event.providerReference)));
  const groups = new Map<string, { currency: string | null; amount: number | null; callCount: number }>();
  for (const event of verified) {
    const amount = event.providerCostAmount ?? event.providerCostGbp;
    const currency = event.providerCostAmount != null ? event.providerCostCurrency : "GBP";
    const key = currency ?? "unavailable";
    const group = groups.get(key) ?? { currency, amount: 0, callCount: 0 };
    group.callCount++;
    group.amount = amount == null || group.amount == null ? null : group.amount + Number(amount);
    groups.set(key, group);
  }
  const missing = uncaptured || verified.some((event) => event.providerCostAmount == null && event.providerCostGbp == null);
  const nonGbp = verified.some((event) => event.providerCostAmount != null && event.providerCostCurrency !== "GBP");
  const gbp = groups.get("GBP")?.amount ?? 0;
  return { directProviderCosts: [...groups.values()], verified, costsCompleteForGbpMargin: !missing && !nonGbp,
    missingCostState: missing ? "provider_cost_unavailable" : nonGbp ? "provider_currency_unavailable_or_non_gbp" : null,
    directProviderCostGbp: !missing && !nonGbp ? gbp : null,
    grossContributionGbp: !missing && !nonGbp ? revenueGbp - Number(gbp) : null };
}

// These are deliberately longer than normal provider work.  A receptionist
// call can legitimately remain active far longer than an HTTP request, while
// image and message providers have bounded server-side request timeouts.
const reservationLeaseMs: Record<string, number> = {
  social_ai_meta: 15 * 60 * 1_000,
  concept_visuals: 15 * 60 * 1_000,
  ai_receptionist: 24 * 60 * 60 * 1_000,
};

function assertReservationInput(input: {
  companyId: number; ownerUserId: string; period: UsagePeriod; featureCode: string;
  quantity: number; limit: number; dedupeKey: string;
}) {
  if (!Number.isSafeInteger(input.companyId) || input.companyId <= 0) throw new Error("Reservation company ID must be a positive integer.");
  if (!input.ownerUserId.trim() || input.ownerUserId.length > 255) throw new Error("Reservation owner user ID is invalid.");
  if (!input.featureCode.trim() || input.featureCode.length > 100) throw new Error("Reservation feature code is invalid.");
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Reservation quantity must be a positive integer.");
  if (!Number.isSafeInteger(input.limit) || input.limit < 0) throw new Error("Reservation limit must be a non-negative integer.");
  if (!input.dedupeKey.trim() || input.dedupeKey.length > 500) throw new Error("Reservation dedupe key is invalid.");
  if (!(input.period.startsAt instanceof Date) || Number.isNaN(input.period.startsAt.valueOf())
    || !(input.period.endsAt instanceof Date) || Number.isNaN(input.period.endsAt.valueOf())
    || input.period.startsAt.getTime() >= input.period.endsAt.getTime()) throw new Error("Reservation usage period is invalid.");
}

const monthPeriod = (now: Date) => ({
  startsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
});

/** Stripe's stored period is authoritative. Calendar periods are limited to development or explicitly migrated legacy tenants. */
export async function usagePeriodForTenant(companyId: number, ownerUserId: string, now = new Date()): Promise<UsagePeriod> {
  const [[subscription], [company]] = await Promise.all([
    db.select().from(companySubscriptionsTable)
      .where(and(eq(companySubscriptionsTable.companyId, companyId), eq(companySubscriptionsTable.ownerUserId, ownerUserId))).limit(1),
    db.select({ legacyBilling: companiesTable.legacyBilling }).from(companiesTable)
      .where(and(eq(companiesTable.id, companyId), eq(companiesTable.ownerUserId, ownerUserId))).limit(1),
  ]);
  const stripePeriod = subscription?.provider === "stripe" && subscription.currentPeriodStartsAt && subscription.currentPeriodEndsAt
    ? { startsAt: subscription.currentPeriodStartsAt, endsAt: subscription.currentPeriodEndsAt, isDevelopmentFallback: false }
    : undefined;
  const explicitLegacyPeriod = !subscription && company?.legacyBilling === true;
  if (!stripePeriod && process.env.NODE_ENV !== "development" && !explicitLegacyPeriod) {
    throw new Error("A Stripe subscription billing period is required to meter usage.");
  }
  const period = stripePeriod ?? {
    ...monthPeriod(now),
    isDevelopmentFallback: process.env.NODE_ENV === "development",
  };
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
    providerCostAmount: input.providerCostAmount?.toString(), providerCostCurrency: input.providerCostCurrency ?? null,
  }).onConflictDoNothing().returning();
  return { event, period };
}

/**
 * The Vapi cost receipt starts pending when the canonical API has not
 * finalised cost. It may be enriched once, but a captured amount is immutable:
 * a later provider response can never rewrite historical cost.
 */
export async function upsertVapiProviderCost(input: UsageInput & { providerReference: string; metadata: Record<string, unknown> }) {
  if (!input.dedupeKey.startsWith("vapi_cost:") || input.dedupeKey !== `vapi_cost:${input.providerReference}`) {
    throw new Error("Vapi provider cost must use its deterministic call key.");
  }
  const period = await usagePeriodForTenant(input.companyId, input.ownerUserId, input.occurredAt ?? new Date());
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${input.companyId}, hashtext(${input.dedupeKey}))`);
    const [existing] = await tx.select().from(billingUsageEventsTable).where(and(
      eq(billingUsageEventsTable.companyId, input.companyId),
      eq(billingUsageEventsTable.ownerUserId, input.ownerUserId),
      eq(billingUsageEventsTable.dedupeKey, input.dedupeKey),
    )).limit(1);
    if (!existing) {
      const [event] = await tx.insert(billingUsageEventsTable).values({
        ...input, usagePeriodId: period.id, periodStartsAt: period.startsAt, periodEndsAt: period.endsAt,
        idempotencyKey: input.dedupeKey, providerCostAmount: input.providerCostAmount?.toString(),
        providerCostCurrency: input.providerCostCurrency ?? null,
        providerCostGbp: input.providerCostGbp?.toString(),
      }).returning();
      return { event, repaired: false };
    }
    if (existing.source !== "vapi_canonical" || existing.providerReference !== input.providerReference
      || existing.usageCategory !== "vapi_provider_cost") throw new Error("Vapi provider cost key belongs to another ledger event.");
    const oldAmount = existing.providerCostAmount == null ? null : Number(existing.providerCostAmount);
    const newAmount = input.providerCostAmount == null ? null : Number(input.providerCostAmount);
    if (oldAmount != null && newAmount != null && oldAmount !== newAmount) {
      throw new Error("Authoritative Vapi cost is immutable once captured.");
    }
    if (oldAmount != null) {
      // Same amount may add the previously unavailable currency, never replace it.
      if (existing.providerCostCurrency && input.providerCostCurrency && existing.providerCostCurrency !== input.providerCostCurrency) {
        throw new Error("Authoritative Vapi cost currency is immutable once captured.");
      }
      const finalCurrency = existing.providerCostCurrency ?? input.providerCostCurrency ?? null;
      const [event] = await tx.update(billingUsageEventsTable).set({
        providerCostCurrency: finalCurrency,
        providerCostGbp: finalCurrency === "GBP" ? oldAmount.toString() : existing.providerCostGbp,
        // Canonical responses can supply components after an early cost total.
        // Metadata here is already the narrow, numeric-only Vapi subset.
        metadata: input.metadata,
      }).where(eq(billingUsageEventsTable.id, existing.id)).returning();
      return { event, repaired: !existing.providerCostCurrency && Boolean(input.providerCostCurrency) };
    }
    // Pending/null amount can be fully populated by a later canonical response.
    const [event] = await tx.update(billingUsageEventsTable).set({
      providerCostAmount: newAmount?.toString(),
      providerCostCurrency: input.providerCostCurrency ?? existing.providerCostCurrency,
      providerCostGbp: input.providerCostCurrency === "GBP" && newAmount != null ? newAmount.toString() : existing.providerCostGbp,
      metadata: input.metadata,
    }).where(eq(billingUsageEventsTable.id, existing.id)).returning();
    return { event, repaired: true };
  });
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
}, database: Pick<typeof db, "transaction"> = db) {
  assertReservationInput(input);
  const leaseMs = reservationLeaseMs[input.featureCode] ?? 15 * 60 * 1_000;
  return database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${input.companyId}, hashtext(${input.featureCode}))`);
    // Clear interrupted provider work before calculating remaining allowance.
    // This is in the same per-tenant/feature critical section as the sum.
    await tx.update(billingUsageReservationsTable).set({ status: "released", releasedAt: new Date() }).where(and(
      eq(billingUsageReservationsTable.companyId, input.companyId),
      eq(billingUsageReservationsTable.ownerUserId, input.ownerUserId),
      eq(billingUsageReservationsTable.featureCode, input.featureCode),
      eq(billingUsageReservationsTable.status, "reserved"),
      lt(billingUsageReservationsTable.expiresAt, new Date()),
    ));
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
      expiresAt: new Date(Date.now() + leaseMs),
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

/** Internal provider-backed history. Native values win; legacy verified GBP values remain reportable. */
export async function providerCostHistoryForTenant(companyId: number, ownerUserId: string, period: Pick<UsagePeriod, "startsAt" | "endsAt">) {
  return db.select({
    providerReference: billingUsageEventsTable.providerReference,
    quantity: billingUsageEventsTable.quantity,
    occurredAt: billingUsageEventsTable.occurredAt,
    source: billingUsageEventsTable.source,
    usageCategory: billingUsageEventsTable.usageCategory,
    providerCostAmount: billingUsageEventsTable.providerCostAmount,
    providerCostCurrency: billingUsageEventsTable.providerCostCurrency,
    providerCostGbp: billingUsageEventsTable.providerCostGbp,
  }).from(billingUsageEventsTable).where(and(
    eq(billingUsageEventsTable.companyId, companyId),
    eq(billingUsageEventsTable.ownerUserId, ownerUserId),
    gte(billingUsageEventsTable.occurredAt, period.startsAt),
    lt(billingUsageEventsTable.occurredAt, period.endsAt),
  ));
}