import { createHash } from "node:crypto";

export type MtdExpense = {
  id: number;
  transactionDate: string | null;
  grossAmount: string | number | null;
  category: string | null;
  supplierName?: string | null;
  reviewStatus: string;
};
export type MtdIncome = {
  id: number;
  receivedDate: string;
  grossAmount: string | number;
  category: string | null;
  source: string;
};
export function canonicalObligationKey(obligation: { businessType: string; businessId: string; periodStartDate: string; periodEndDate: string }): string {
  return `${obligation.businessType}:${obligation.businessId}:${obligation.periodStartDate}:${obligation.periodEndDate}`;
}

const pounds = (value: string | number | null): number => Math.round(Number(value ?? 0) * 100) / 100;
const inPeriod = (date: string | null, start: string, end: string) => Boolean(date && date >= start && date <= end);
const supportedIncome = (row: MtdIncome) => !/ai|suggestion|unreviewed/i.test(row.source);
const SUPPORTED_EXPENSE_CATEGORIES = new Set(["Materials", "Labour", "Fuel and travel", "Tools and equipment", "Plant hire", "Subcontractors", "Office and software", "Insurance", "Training", "Marketing", "Professional fees"]);

/** Pure, conservative calculation: only human-confirmed expenses and recorded income. */
export function prepareQuarterlyFigures(input: {
  periodStart: string;
  periodEnd: string;
  expenses: MtdExpense[];
  income: MtdIncome[];
  receiptExpenseIds: Set<number>;
}) {
  const periodExpenses = input.expenses.filter((row) => inPeriod(row.transactionDate, input.periodStart, input.periodEnd));
  const confirmedExpenses = periodExpenses.filter((row) =>
    (row.reviewStatus === "confirmed" || row.reviewStatus === "corrected") && row.grossAmount != null,
  );
  const includedExpenses = confirmedExpenses.filter((row) => SUPPORTED_EXPENSE_CATEGORIES.has(row.category?.trim() ?? ""));
  const includedIncome = input.income.filter((row) =>
    inPeriod(row.receivedDate, input.periodStart, input.periodEnd) && supportedIncome(row),
  );
  const categoryMap = new Map<string, number>();
  for (const row of includedExpenses) {
    const category = row.category?.trim() || "Uncategorised";
    categoryMap.set(category, pounds((categoryMap.get(category) ?? 0) + pounds(row.grossAmount)));
  }
  const incomeTotal = pounds(includedIncome.reduce((total, row) => total + pounds(row.grossAmount), 0));
  const expenseTotal = pounds(includedExpenses.reduce((total, row) => total + pounds(row.grossAmount), 0));
  const duplicateKeys = new Map<string, number[]>();
  for (const row of confirmedExpenses) {
    const key = [
      row.transactionDate ?? "",
      pounds(row.grossAmount).toFixed(2),
      row.supplierName?.trim().toLowerCase() ?? "",
    ].join("|");
    const ids = duplicateKeys.get(key) ?? [];
    ids.push(row.id);
    duplicateKeys.set(key, ids);
  }
  const potentialDuplicateExpenseIds = [...duplicateKeys.values()]
    .filter((ids) => ids.length > 1)
    .flat();
  const unreviewedExpenseIds = periodExpenses
    .filter((row) => row.reviewStatus !== "confirmed" && row.reviewStatus !== "corrected")
    .map((row) => row.id);
  const uncategorisedExpenseIds = confirmedExpenses
    .filter((row) => !row.category?.trim())
    .map((row) => row.id);
  const unsupportedExpenseIds = confirmedExpenses
    .filter((row) => !SUPPORTED_EXPENSE_CATEGORIES.has(row.category?.trim() ?? ""))
    .map((row) => row.id);
  const figures = {
    incomeTotal,
    expenseTotal,
    netProfit: pounds(incomeTotal - expenseTotal),
    expenseCategories: [...categoryMap.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    includedIncomeIds: includedIncome.map((row) => row.id),
    includedExpenseIds: includedExpenses.map((row) => row.id),
    warnings: {
      unreviewedExpenseIds,
      missingEvidenceExpenseIds: includedExpenses.filter((row) => !input.receiptExpenseIds.has(row.id)).map((row) => row.id),
      uncategorisedExpenseIds,
      unsupportedExpenseIds,
      potentialDuplicateExpenseIds,
    },
    readyForSubmission:
      unreviewedExpenseIds.length === 0 &&
      unsupportedExpenseIds.length === 0 &&
      potentialDuplicateExpenseIds.length === 0,
  };
  return { figures, payloadHash: createHash("sha256").update(JSON.stringify(figures)).digest("hex") };
}

export function submissionStatusFromGateway(result: { confirmed: boolean; reference?: string | null; safeResponse?: unknown; safeError?: string }) {
  return result.confirmed && result.reference
    ? { status: "submitted" as const, reference: result.reference, safeResponse: result.safeResponse ?? null, safeError: null }
    : { status: "retry_required" as const, reference: null, safeResponse: null, safeError: result.safeError ?? "HMRC did not confirm this sandbox submission." };
}