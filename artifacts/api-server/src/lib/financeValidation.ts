export function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
}

export function moneyString(value: unknown): string | null {
  const amount = numberOrNull(value);
  return amount == null ? null : amount.toFixed(2);
}

export function isFinanceDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function dateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return isFinanceDate(value) ? value : null;
  return value.toISOString().slice(0, 10);
}

export function inPeriod(value: Date | string | null | undefined, from?: string, to?: string): boolean {
  const day = dateKey(value);
  if (!day) return false;
  return (!from || day >= from) && (!to || day <= to);
}

export function validateFinanceAmounts(amounts: Record<string, unknown>): string | null {
  const parsed = Object.fromEntries(["grossAmount", "netAmount", "vatAmount"].map((field) => [
    field,
    amounts[field] == null || amounts[field] === "" ? null : numberOrNull(amounts[field]),
  ])) as Record<string, number | null>;
  for (const [field, amount] of Object.entries(parsed)) {
    if (amount === null && amounts[field] != null && amounts[field] !== "") return `${field} must be a valid number`;
    if (amount !== null && amount < 0) return `${field} cannot be negative`;
  }
  if (
    parsed.grossAmount !== null
    && parsed.netAmount !== null
    && parsed.vatAmount !== null
    && Math.abs(parsed.grossAmount - parsed.netAmount - parsed.vatAmount) > 0.01
  ) {
    return "grossAmount must equal netAmount plus vatAmount when all three values are entered";
  }
  return null;
}

export function csvValue(value: unknown): string {
  const raw = value == null ? "" : String(value);
  // Spreadsheet applications can treat cells beginning with a formula token as
  // executable expressions even when CSV quoting is otherwise correct.
  const safe = /^[\u0000-\u0020]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}