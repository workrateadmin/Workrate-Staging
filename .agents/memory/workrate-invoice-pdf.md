---
name: WorkRate invoice PDF storage boundary
description: Security boundary for loading tenant-controlled branding into generated documents.
---

Generated documents may load tenant branding only through the normal uploaded-image namespace. Never make server-side requests to tenant-controlled branding URLs or let rendering code read finance/other private object namespaces.

**Why:** Arbitrary URL loading creates SSRF and unbounded-download risks; unrestricted direct object reads bypass namespace protections on storage-serving routes.

**How to apply:** Validate branding against the storage parser's canonical path before any read, allow only the intended image namespace and formats, and retain acceptance/rejection regression tests.