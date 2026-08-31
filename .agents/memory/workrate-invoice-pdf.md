---
name: WorkRate invoice PDF storage boundary
description: Security and consistency boundaries for generated customer documents and email delivery.
---

Generated documents may load tenant branding only through the normal uploaded-image namespace. Never make server-side requests to tenant-controlled branding URLs or let rendering code read finance/other private object namespaces.

**Why:** Arbitrary URL loading creates SSRF and unbounded-download risks; unrestricted direct object reads bypass namespace protections on storage-serving routes.

**How to apply:** Validate branding against the storage parser's canonical path before any read, allow only the intended image namespace and formats, and retain acceptance/rejection regression tests.

Email bodies and their attached PDFs must be derived from one freshly loaded persisted document snapshot. A successful send may advance an invoice from draft to sent only with a conditional database update that still matches draft.

**Why:** Separate reads can send conflicting totals or scope, while an unconditional post-provider update can overwrite a payment recorded concurrently and reopen a paid invoice.

**How to apply:** Load the document immediately before dispatch, use that object for both formats, and guard workflow status transitions by their expected current state.