---
name: WorkRate timeline boundaries
description: Durable identity, evidence, and performance rules for customer and job activity timelines.
---

Treat an enquiry as the customer/project boundary until WorkRate has a dedicated customer identity model. Never combine enquiries by matching names, email addresses, or phone numbers.

**Why:** Existing records prove relationships through enquiry and job foreign keys, but they do not prove that similar contact details represent one customer. Combining them would risk cross-customer or cross-tenant disclosure.

**How to apply:** Include only records explicitly linked through an owner-authorized enquiry or job. Derive activity from persisted lifecycle timestamps using database-side normalized pagination. Do not present mutable fields as history, invent status transitions, or add company billing events to a customer/job timeline.