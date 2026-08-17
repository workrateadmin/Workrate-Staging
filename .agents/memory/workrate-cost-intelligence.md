---
name: WorkRate Cost Intelligence
description: Schema, extraction service, and UI for the job intelligence dataset (cutting lists, BOMs, supplier invoices)
---

## Tables (migration 0008)
- `job_production_documents` — altered: added `uploaded_by_user_id`, `extraction_status`, `extraction_timestamp`, `extraction_method`
- `job_intelligence_components` — one row per component/BOM item. Stores finished AND sawn dimensions separately.
- `job_intelligence_invoice_lines` — one row per supplier invoice line item.

## UK Timber Rule (hard constraint)
Sawn/nominal dimensions (`sawn_*_mm`) are NEVER invented from finished dimensions. They stay null unless the source document explicitly states the stock size. This is enforced in both the AI prompt (COMPONENT_PROMPT) and the edit form label.

## Extractor service
`artifacts/api-server/src/lib/intelligenceExtractor.ts`
- Uses GPT-4o vision for images/PDFs (base64 encoded)
- Uses `xlsx` library to convert XLSX/XLS/CSV → CSV text, then sends as text prompt
- Two prompts: COMPONENT_PROMPT (cutting lists/BOMs) and INVOICE_PROMPT
- Returns `ExtractionResult` with `.components[]` and `.invoiceLines[]`
- `EXTRACTION_METHOD = "openai-gpt4o-v1"` exported constant

## API routes (jobs.ts)
- `POST /jobs/:id/production-documents` — uploads to GCS, then calls extractor synchronously, inserts intelligence rows, returns `{ ...doc, extractedComponentCount, extractedInvoiceLineCount }`
- `GET /jobs/:id/intelligence` — returns `{ components, invoiceLines }` grouped by documentId
- `PUT/DELETE /jobs/:id/intelligence/components/:rowId`
- `POST /jobs/:id/intelligence/components` (manual add)
- `PUT/DELETE /jobs/:id/intelligence/invoice-lines/:rowId`
- `POST /jobs/:id/intelligence/invoice-lines` (manual add)
- All routes verify job ownership via `verifyJobOwnership`

## Frontend (job-detail.tsx)
- `IntelligenceSection` component at bottom of file — self-contained, manages its own editing state
- Appears inside the Job Actuals card, after Production Documents section, wrapped in a `pt-4 border-t` div
- `IntelStatusBadge` renders: violet=AI extracted, green=Reviewed, blue=Corrected, grey=Manual; shows confidence % if < 70%
- Edit form expands inline; saving sets status to `corrected` and calls PUT
- `handleUploadDoc` calls `loadIntelligence()` after upload to refresh extracted rows
- Empty state: "Upload a cutting list or supplier invoice above — WorkRate will extract structured component and cost data automatically."

**Why:** The duplicate export bug (`export * from "./jobs"` appeared twice in schema/index.ts) caused a build failure — always check schema/index.ts after adding new table exports.
