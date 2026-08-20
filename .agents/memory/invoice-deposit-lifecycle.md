---
name: Invoice deposit lifecycle
description: Rules for standalone invoice deposits, payment recording, and the limits of the approved scope.
---

Standalone invoices support no deposit or a percentage deposit, including the common 50% choice. The server calculates the requested deposit from the VAT-inclusive invoice total and persists the remaining balance.

**Why:** The approved scope deliberately avoids online checkout, payment webhooks, and a full transaction ledger. A deposit receipt must not mark an invoice as fully paid or hide the outstanding balance.

**How to apply:** Record the deposit with a dedicated action, then retain the invoice as unpaid until the final balance is marked received. Treat a 100% deposit as full payment and settle it in that same receipt action. Do not let generic invoice updates set a payment status; dedicated receipt actions enforce the required amount and settled balance. Lock all financial and line-item fields once a deposit has been recorded or the invoice is paid, while allowing non-financial edits and invoice resends. Display the total, requested/received deposit, and remaining balance in the invoice document and email. Use deposit-specific payment instructions only while the deposit is outstanding; after receipt, direct the remaining balance using the normal bank details.