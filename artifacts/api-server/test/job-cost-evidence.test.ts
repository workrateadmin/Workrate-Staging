import test from "node:test";
import assert from "node:assert/strict";
import { buildJobEvidenceSummary, evidenceState, finiteNonNegative } from "../src/services/jobCostEvidence";

test("Job A with all confirmed evidence is ready and has deterministic variances", () => {
  const result = buildJobEvidenceSummary({
    job: { finalAmountCharged: "200", totalWithVat: "180", variationAmount: "0" },
    labour: [{ confirmationState: "confirmed", actualCost: "50", estimatedCost: "40", actualHours: "5" }],
    materials: [{ confirmationState: "confirmed", actualCost: "70", estimatedCost: "60" }],
    otherDirectCosts: [{ confirmationState: "confirmed", actualCost: "10", estimatedCost: "10" }],
    allocations: [{ confirmationState: "confirmed" }], documents: [{}], components: [],
  });
  assert.equal(result.readiness.state, "ready");
  assert.equal(result.actuals.total, 130);
  assert.equal(result.variances.total, 20);
  assert.equal(result.outcome.grossProfit, 70);
});
test("Job B legacy scalar actuals remains partial and missing estimates stay null", () => {
  const result = buildJobEvidenceSummary({
    job: { actualLabourCost: "20", actualMaterialsCost: "30", totalWithVat: "100" },
    labour: [], materials: [], otherDirectCosts: [], allocations: [], documents: [], components: [],
  });
  assert.equal(result.readiness.state, "partially_ready");
  assert.equal(result.actuals.total, 50);
  assert.equal(result.estimates.total, null);
  assert.equal(result.variances.total, null);
  assert.equal(result.outcome.grossProfit, null);
});
test("AI suggestions cannot be trusted without confirmation and numeric validation is finite", () => {
  assert.equal(evidenceState("ai_extracted", "confirmed"), "suggested");
  assert.equal(evidenceState("manual", undefined), "confirmed");
  assert.match(finiteNonNegative(Infinity, "cost") ?? "", /finite/);
  assert.match(finiteNonNegative(-1, "cost") ?? "", /nonnegative/);
});