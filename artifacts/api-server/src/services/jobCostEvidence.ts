/** Pure validation and calculation helpers for private completed-job evidence. */
export type ReadinessState = "not_ready" | "partially_ready" | "ready";

export function finiteNonNegative(value: unknown, name: string, required = false): string | null {
  if (value == null || value === "") return required ? `${name} is required` : null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? null : `${name} must be a finite nonnegative number`;
}

export function evidenceState(sourceType: unknown, requested: unknown): string {
  if (requested === "ignored") return "ignored";
  // Anything claimed to be extracted is suggestion-only, irrespective of client state.
  if (sourceType === "ai_extracted" || sourceType === "ai" || sourceType === "extraction") return "suggested";
  return requested === "suggested" ? "suggested" : "confirmed";
}

const n = (value: unknown): number | null => value == null ? null : Number(value);
const sum = (values: unknown[]): number | null => {
  const known = values.map(n).filter((x): x is number => x != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};
const variance = (actual: unknown, estimate: unknown): number | null => {
  const a = n(actual); const e = n(estimate);
  return a == null || e == null ? null : a - e;
};

export function buildJobEvidenceSummary(input: {
  job: any; labour: any[]; materials: any[]; otherDirectCosts: any[];
  allocations: any[]; documents: any[]; components: any[];
}) {
  const { job, labour, materials, otherDirectCosts, allocations, documents, components } = input;
  const confirmed = (rows: any[]) => rows.filter((row) => row.confirmationState === "confirmed");
  const confirmedLabour = confirmed(labour);
  const confirmedMaterials = confirmed(materials);
  const confirmedOther = confirmed(otherDirectCosts);
  const labourActual = sum(confirmedLabour.map(x => x.actualCost)) ?? n(job.actualLabourCost);
  const materialActual = sum(confirmedMaterials.map(x => x.actualCost)) ?? n(job.actualMaterialsCost);
  const otherActual = sum(confirmedOther.map(x => x.actualCost));
  const labourEstimate = sum(labour.map(x => x.estimatedCost));
  const materialEstimate = sum(materials.map(x => x.estimatedCost));
  const otherEstimate = sum(otherDirectCosts.map(x => x.estimatedCost));
  const estimatedTotal = sum([labourEstimate, materialEstimate, otherEstimate]);
  const actualTotal = sum([labourActual, materialActual, otherActual]);
  const finalAmount = n(job.finalAmountCharged);
  const grossProfit = finalAmount == null || actualTotal == null ? null : finalAmount - actualTotal;
  const grossMargin = finalAmount == null || finalAmount === 0 || grossProfit == null ? null : grossProfit / finalAmount * 100;
  const factors = [
    finalAmount != null,
    labourActual != null || confirmedLabour.some(x => n(x.actualHours) != null),
    materialActual != null,
    allocations.some(x => x.confirmationState === "confirmed"),
    confirmedMaterials.length > 0,
    documents.length > 0 || components.length > 0,
    job.variationAmount != null || job.variationNote != null,
  ];
  const percentage = Math.round(factors.filter(Boolean).length / factors.length * 100);
  const state: ReadinessState = percentage === 0 ? "not_ready" : percentage === 100 ? "ready" : "partially_ready";
  return {
    readiness: { state, percentage, factors: {
      finalPrice: factors[0], labour: factors[1], materials: factors[2], linkedReceipts: factors[3],
      confirmedMaterials: factors[4], bomOrDocuments: factors[5], variationOutcome: factors[6],
    } },
    actuals: { labour: labourActual, materials: materialActual, otherDirectCosts: otherActual, total: actualTotal },
    estimates: { labour: labourEstimate, materials: materialEstimate, otherDirectCosts: otherEstimate, total: estimatedTotal },
    variances: { labour: variance(labourActual, labourEstimate), materials: variance(materialActual, materialEstimate), otherDirectCosts: variance(otherActual, otherEstimate), total: variance(actualTotal, estimatedTotal), sellingPrice: variance(finalAmount, job.totalWithVat) },
    outcome: { finalAmount, grossProfit, grossMargin },
  };
}