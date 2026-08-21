---
name: Finance evidence boundaries
description: Durable safety rules for Finance / MTD preparation records, receipt storage, and links to existing invoicing.
---

Finance must derive invoice, deposit, and final-payment activity from the established invoice records rather than copy it into a second ledger. Other income is recorded separately. Keep invoice-value reporting distinct from cash-received reporting so deposits and final payments are never double counted.

**Why:** Existing invoice and payment flows are the source of truth. Duplicating them creates reconciliation drift, while adding cash receipts to invoice values inflates the tax-preparation view.

**How to apply:** New Finance reporting should query the existing invoice source and clearly label invoice value versus cash received. Never change invoice, payment, or Job Actuals data from a receipt upload or AI extraction.

Receipt files are evidence, not public assets. AI extraction is a reviewable suggestion only; it may populate a pending finance record, but only an explicit human confirmation can make it eligible for tax-preparation totals. Finance evidence must not be reachable through generic object-serving paths, and content hashes are unique per business to prevent duplicate records.

**Why:** An opaque object URL is not tenant authorization, and generated values must not become financial facts without human verification.

**How to apply:** Keep finance receipt streaming behind an authenticated business ownership check. Preserve original extraction data and before/after audit values. For any future job-cost roll-up, require an explicit user action and prevent a receipt from applying its cost more than once.