---
name: WorkRate Documents & Branding
description: Architecture decisions for the Documents & Branding feature — template modes, branding snapshot, upload routes.
---

# Documents & Branding Feature

## Template modes
`companies.document_mode` is either `'workrate'` (default, professionally styled) or `'custom'` (applies company branding settings).

**Why:** User wanted two explicit choices rather than always-on branding, and new accounts should default to WorkRate template with no setup required.

## Branding snapshot on send
When a quote's status first changes to `'sent'` or `'accepted'`, the server snapshots the current company branding into `quotes.branding_snapshot` (JSON text). The `QuoteDocument` component reads this snapshot so historical quotes always render with the design they had at send time.

**Why:** "Previously generated documents should retain the design and information they had when they were created."

**How to apply:** In `quotes.ts` PATCH, `snapshotBranding(userId)` is called when status becomes 'sent'/'accepted' and no snapshot yet exists. Snapshot is stored in `updates.brandingSnapshot`.

## New DB columns (companies)
`website`, `company_reg_number`, `vat_number`, `bank_payment_details`, `brand_colour_primary`, `brand_colour_secondary`, `payment_terms`, `terms_and_conditions`, `quote_footer`, `invoice_footer`, `document_mode`. Added in migration `0003_documents_branding`.

## File uploads
`POST /api/uploads/logo` and `POST /api/uploads/template` — use multer/disk pattern identical to `attachments.ts`. Logo is saved immediately via `PUT /company { logoUrl }`. Template files are stored as reference only (explained clearly in UI with amber warning).

**Why:** Object storage skill requires Replit Auth (app uses Clerk). Reusing the existing multer pattern was simpler and consistent.

## Custom branding in QuoteDocument
When `documentMode === 'custom'`:
- Header background = `brandColourPrimary`
- Logo shown if `logoUrl` present (with auto invert filter for dark backgrounds)
- Website, company reg, VAT number shown in header contact block
- Bank/payment details, payment terms shown as document sections
- `quoteFooter` replaces hardcoded footer text
- `termsAndConditions` shown at end of document

Luminance check (`isLight(hex)`) auto-picks white or dark text for header.

## Template upload limitation (documented in UI)
WorkRate does NOT auto-parse uploaded PDF/DOCX layouts. Uploads are reference-only. The amber warning in the UI explains this clearly per user requirement.
