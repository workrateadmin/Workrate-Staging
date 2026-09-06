import assert from "node:assert/strict";
import test from "node:test";
import { canonicalObligationKey, prepareQuarterlyFigures, submissionStatusFromGateway } from "../src/lib/hmrc-quarterly-preparation";

test("quarterly preparation includes only confirmed expenses and non-AI income in period", () => {
  const result = prepareQuarterlyFigures({
    periodStart: "2026-04-01", periodEnd: "2026-06-30",
    expenses: [
      { id: 1, transactionDate: "2026-04-02", grossAmount: "12.50", category: "Tools and equipment", reviewStatus: "confirmed" },
      { id: 2, transactionDate: "2026-05-02", grossAmount: "20.00", category: "Fuel", reviewStatus: "needs_review" },
      { id: 3, transactionDate: "2026-07-01", grossAmount: "99.00", category: "Tools", reviewStatus: "corrected" },
    ],
    income: [
      { id: 11, receivedDate: "2026-04-05", grossAmount: "100.00", category: null, source: "manual" },
      { id: 12, receivedDate: "2026-04-06", grossAmount: "50.00", category: null, source: "ai_suggestion" },
    ],
    receiptExpenseIds: new Set(),
  });
  assert.equal(result.figures.incomeTotal, 100);
  assert.equal(result.figures.expenseTotal, 12.5);
  assert.deepEqual(result.figures.includedExpenseIds, [1]);
  assert.deepEqual(result.figures.warnings.unreviewedExpenseIds, [2]);
  assert.deepEqual(result.figures.warnings.missingEvidenceExpenseIds, [1]);
  assert.deepEqual(result.figures.warnings.unsupportedExpenseIds, []);
});

test("canonical obligation key binds business identity and exact period", () => {
  assert.notEqual(
    canonicalObligationKey({ businessType: "self-employment", businessId: "A", periodStartDate: "2026-04-01", periodEndDate: "2026-06-30" }),
    canonicalObligationKey({ businessType: "self-employment", businessId: "B", periodStartDate: "2026-04-01", periodEndDate: "2026-06-30" }),
  );
});

test("unsupported confirmed categories are excluded and block readiness", () => {
  const result = prepareQuarterlyFigures({ periodStart: "2026-04-01", periodEnd: "2026-06-30", income: [], receiptExpenseIds: new Set(), expenses: [
    { id: 5, transactionDate: "2026-04-01", grossAmount: "9", category: "Other", reviewStatus: "confirmed" },
  ] });
  assert.equal(result.figures.expenseTotal, 0);
  assert.equal(result.figures.readyForSubmission, false);
  assert.deepEqual(result.figures.warnings.unsupportedExpenseIds, [5]);
});

test("same-day same-supplier confirmed expenses are flagged as potential duplicates", () => {
  const result = prepareQuarterlyFigures({
    periodStart: "2026-04-01",
    periodEnd: "2026-06-30",
    income: [],
    receiptExpenseIds: new Set([6, 7]),
    expenses: [
      { id: 6, transactionDate: "2026-04-10", grossAmount: "42.50", category: "Materials", supplierName: "Builder Depot", reviewStatus: "confirmed" },
      { id: 7, transactionDate: "2026-04-10", grossAmount: "42.50", category: "Materials", supplierName: "builder depot", reviewStatus: "confirmed" },
    ],
  });
  assert.equal(result.figures.readyForSubmission, false);
  assert.deepEqual(result.figures.warnings.potentialDuplicateExpenseIds, [6, 7]);
});

test("a submission is never marked successful without an HMRC-confirmed reference", () => {
  assert.equal(submissionStatusFromGateway({ confirmed: true }).status, "retry_required");
  assert.equal(submissionStatusFromGateway({ confirmed: false, reference: "ignored" }).status, "retry_required");
  assert.deepEqual(submissionStatusFromGateway({ confirmed: true, reference: "HMRC-1" }), {
    status: "submitted", reference: "HMRC-1", safeResponse: null, safeError: null,
  });
});