---
name: Actual-job evidence trust boundary
description: Rules for completion evidence access, readiness, provenance, and private material price history.
---

Actual-job evidence capture is part of the core job-completion workflow and must not be gated by the separate Cost Intelligence billing entitlement. Readiness labels describe whether a job is suitable for later intelligence; they do not control normal job use.

**Why:** A newly onboarded business could see completion evidence forms but every save returned 402 when evidence routes inherited the AI Cost Intelligence entitlement gate. The product specification requires sparse jobs to remain valid and finishable.

**How to apply:** Keep evidence CRUD, receipt allocation, and private material history behind authentication and tenant ownership, but not the AI feature entitlement. Premium extraction/document capabilities may retain their own explicit gates.

Readiness is a deterministic data-completeness score, never AI confidence. Missing financial inputs remain null, so profit, margin, and variance are shown only when their required inputs exist.

**Why:** Zero-filling missing evidence makes sparse historical jobs appear complete and creates false profitability.

**How to apply:** Count only confirmed evidence in trusted totals. Extracted rows remain suggestions until an explicit confirm action. Preserve legacy scalar actuals as fallback without fabricating line-item detail.

Private material cost history is append-only and requires an explicitly confirmed job material linked to that business's catalogue item. Reconfirming an already confirmed row must be idempotent.

**Why:** Overwriting or duplicating observations destroys price provenance and can silently turn AI suggestions into trusted costs.

**How to apply:** Append a new observation only when the linked usage has a real confirmed unit cost; retain source references and never share history across tenants.