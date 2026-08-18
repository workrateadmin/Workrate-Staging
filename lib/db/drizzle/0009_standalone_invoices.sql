-- Migration 0009: Standalone invoice support
-- Extends the quotes table to act as both quotes AND standalone invoices.
-- Preserves every existing quote/proposal row untouched.

-- 1. Make enquiry_id nullable — invoices don't require an enquiry.
ALTER TABLE quotes
  ALTER COLUMN enquiry_id DROP NOT NULL;

-- 2. Add invoice-specific columns.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS document_type   TEXT         NOT NULL DEFAULT 'quote',
  ADD COLUMN IF NOT EXISTS invoice_number  TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date    TEXT,
  ADD COLUMN IF NOT EXISTS due_date        TEXT,
  ADD COLUMN IF NOT EXISTS job_id          INTEGER      REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vat_rate        NUMERIC(5,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS line_items      TEXT,          -- JSON: [{description,quantity,unit,unitPrice,lineTotal}]
  ADD COLUMN IF NOT EXISTS owner_user_id   TEXT,
  ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMPTZ;

-- 3. Backfill owner_user_id for existing quotes from their linked enquiry.
UPDATE quotes q
SET    owner_user_id = e.owner_user_id
FROM   enquiries e
WHERE  e.id = q.enquiry_id
  AND  q.owner_user_id IS NULL;
