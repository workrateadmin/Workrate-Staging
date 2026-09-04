/** Decimal-safe pence arithmetic for the server-owned billing catalogue. */
export type PricedCatalogItem = {
  monthlyPriceGbp: string | number | null;
  trialPercentage?: string | number | null;
  manualTrialPriceGbp?: string | number | null;
  active: boolean;
  comingSoon: boolean;
  stripeProductId?: string | null;
  stripeRecurringPriceId?: string | null;
  stripeTrialPriceId?: string | null;
  stripeMappingValidatedAt?: Date | null;
};

function pence(value: string | number): bigint {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Invalid GBP amount.");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}
function gbp(value: bigint): number { return Number(value) / 100; }

export function trialPriceGbp(item: Pick<PricedCatalogItem, "monthlyPriceGbp" | "trialPercentage" | "manualTrialPriceGbp">): number | null {
  if (item.monthlyPriceGbp == null) return null;
  if (item.manualTrialPriceGbp != null) return gbp(pence(item.manualTrialPriceGbp));
  const percentage = item.trialPercentage == null ? "50" : String(item.trialPercentage);
  if (!/^\d+(?:\.\d{1,2})?$/.test(percentage)) throw new Error("Invalid trial percentage.");
  // Half-up rounding to penny, calculated from integer pence and hundredths of a percent.
  const basisPoints = BigInt((percentage.split(".")[0] + (percentage.split(".")[1] ?? "").padEnd(2, "0")).replace(/^0+(?=\d)/, "") || "0");
  return gbp((pence(item.monthlyPriceGbp) * basisPoints + 5000n) / 10000n);
}

export function catalogAvailability(item: PricedCatalogItem) {
  const missingPrice = item.monthlyPriceGbp == null;
  const missingMapping = !item.stripeProductId || !item.stripeRecurringPriceId || !item.stripeTrialPriceId || !item.stripeMappingValidatedAt;
  const purchasable = item.active && !item.comingSoon && !missingPrice && !missingMapping;
  const configurationMessage = !item.active ? "This item is inactive." : item.comingSoon ? "This item is coming soon." : missingPrice || missingMapping ? "Billing configuration required." : null;
  return { purchasable, configurationMessage };
}

/** WORKRATE_ADMIN_USER_IDS is intentionally default-deny, including whitespace-only values. */
export function isBillingAdmin(userId: string | null | undefined, allowlist = process.env.WORKRATE_ADMIN_USER_IDS): boolean {
  if (!userId || !allowlist?.trim()) return false;
  return allowlist.split(",").map((value) => value.trim()).filter(Boolean).includes(userId);
}