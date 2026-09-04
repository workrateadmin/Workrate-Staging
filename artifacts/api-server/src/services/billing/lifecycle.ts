import { createHmac, timingSafeEqual } from "node:crypto";
/** Pure lifecycle primitives shared by the provider and isolated unit tests. */
export function mapStripeSubscriptionStatus(status: string): "trialing" | "active" | "past_due" | "cancelled" | "pending_selection" {
  if (status === "canceled" || status === "incomplete_expired" || status === "unpaid") return "cancelled";
  if (status === "incomplete") return "past_due";
  return status === "trialing" || status === "active" || status === "past_due" ? status : "pending_selection";
}

export function checkoutLineItems(monthlyPrice: string, paidTrialPrice: string, addOnPrices: string[]) {
  // Stripe Checkout subscription mode accepts recurring and one-time prices:
  // the paid trial is collected now, while the monthly item starts after trial.
  return [{ price: monthlyPrice, quantity: 1 }, { price: paidTrialPrice, quantity: 1 }, ...addOnPrices.map((price) => ({ price, quantity: 1 }))];
}
export function checkoutIdempotencyKey(companyId: number, attemptId: string) {
  return `workrate-checkout:${companyId}:${attemptId}`;
}
/** Submitted webhook data is untrusted: only its event id may select a canonical fetch. */
export function canonicalEventId(payload: Buffer, signature?: string): string {
  if (!signature) throw new Error("Missing Stripe signature.");
  const submitted = JSON.parse(payload.toString("utf8")) as { id?: unknown };
  if (typeof submitted.id !== "string" || !submitted.id.startsWith("evt_")) throw new Error("Invalid Stripe event payload.");
  return submitted.id;
}

export function verifyStripeSignature(payload: Buffer, header: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): void {
  if (!header) throw new Error("Missing Stripe signature.");
  const pairs = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = Number(pairs.find(([key]) => key === "t")?.[1]);
  const signatures = pairs.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new Error("Invalid Stripe signature.");
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) throw new Error("Stale Stripe signature.");
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(payload).digest();
  const valid = signatures.some((candidate) => {
    try {
      const actual = Buffer.from(candidate, "hex");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch { return false; }
  });
  if (!valid) throw new Error("Invalid Stripe signature.");
}
export function requireCanonicalEventId(signedId: string, canonicalId: unknown): void {
  if (canonicalId !== signedId) throw new Error("Canonical Stripe event id mismatch.");
}

export async function processRetryableReceipt(receipt: { processedAt: Date | null }, apply: () => Promise<void>) {
  if (receipt.processedAt) return "duplicate" as const;
  await apply(); // rejection deliberately leaves receipt unprocessed for retry
  receipt.processedAt = new Date();
  return "processed" as const;
}