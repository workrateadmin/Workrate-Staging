-- Migration 0011: make duplicate receipt detection authoritative.
-- Existing application-level checks provide friendly messages; this unique index
-- closes the concurrent-upload race at the database boundary.

CREATE UNIQUE INDEX IF NOT EXISTS finance_receipts_company_hash_unique
  ON finance_receipts(company_id, content_hash);