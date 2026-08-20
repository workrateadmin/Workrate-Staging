---
name: Customer proposal privacy
description: Privacy boundary for customer-facing quotes, printable documents, email content, and public proposal APIs.
---

Customer-facing proposal content must contain only the agreed final total, project scope, deposit/payment schedule, business branding, and customer communication details. Materials allowance, labour allowance, subtotal, VAT amount, and other internal estimating components remain business-only data.

**Why:** Internal allowances guide pricing and profitability but are not part of the customer agreement. Public proposal endpoints are accessible through a token, so removing known fields from a database row is not sufficient protection against later schema additions.

**How to apply:** Use a strict allow-list serializer for every public proposal response, including customer-action responses. Keep authenticated editing and job-profit views free to show the internal components. Customer-printable and email quote content must use the same final-total-only convention; do not include payment instructions until acceptance.