---
name: WorkRate Documents & Branding
description: Architecture decisions for the Documents & Branding feature — template modes, branding snapshot, upload routes.
---

# Documents & Branding Feature

## Template modes
`companies.document_mode` supports `'workrate'` (default, professionally styled), `'custom'` (applies company branding settings), and `'imported'` for an invoice layout based on an existing document.

**Why:** New accounts should default to WorkRate with no setup, while established trades can retain their existing identity.

**How to apply:** An imported invoice template must retain the source artwork as a durable background and place editable live fields over it. Reconstructing only AI-detected text blocks loses logos, colours, borders, and typography.

## Branding snapshot on send
When a quote's status first changes to `'sent'` or `'accepted'`, the server snapshots the current company branding into `quotes.branding_snapshot` (JSON text). The `QuoteDocument` component reads this snapshot so historical quotes always render with the design they had at send time.

**Why:** "Previously generated documents should retain the design and information they had when they were created."

**How to apply:** In `quotes.ts` PATCH, `snapshotBranding(userId)` is called when status becomes 'sent'/'accepted' and no snapshot yet exists. Snapshot is stored in `updates.brandingSnapshot`.

## New DB columns (companies)
`website`, `company_reg_number`, `vat_number`, `bank_payment_details`, `brand_colour_primary`, `brand_colour_secondary`, `payment_terms`, `terms_and_conditions`, `quote_footer`, `invoice_footer`, `document_mode`. Added in migration `0003_documents_branding`.

## File uploads
`POST /api/uploads/logo` and `POST /api/uploads/template` store branding assets in GCS. Generic quote/invoice uploads remain references; the dedicated invoice-import flow retains the source image as the visual template background.

**Why:** A visual reference alone cannot reproduce a client's established document identity accurately.

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
