-- Migration 0010: Finance / MTD-ready data foundation
-- This deliberately creates separate finance records without changing invoice,
-- payment, quote, job, or cost-intelligence behaviour.

CREATE TABLE IF NOT EXISTS finance_expenses (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  transaction_date DATE,
  supplier_name TEXT,
  description TEXT,
  category TEXT,
  gross_amount NUMERIC(12,2),
  net_amount NUMERIC(12,2),
  vat_amount NUMERIC(12,2),
  payment_method TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  review_status TEXT NOT NULL DEFAULT 'needs_review',
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_receipts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  expense_id INTEGER NOT NULL REFERENCES finance_expenses(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  object_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER,
  content_hash TEXT NOT NULL,
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  extraction_method TEXT,
  extracted_data JSONB,
  uploaded_by_user_id TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS finance_income_records (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  received_date DATE NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  gross_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2),
  vat_amount NUMERIC(12,2),
  payment_method TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_audit_events (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_expenses_tenant_date_idx
  ON finance_expenses(company_id, owner_user_id, transaction_date);
CREATE INDEX IF NOT EXISTS finance_expenses_job_idx ON finance_expenses(job_id);
CREATE INDEX IF NOT EXISTS finance_receipts_tenant_hash_idx
  ON finance_receipts(company_id, content_hash);
CREATE INDEX IF NOT EXISTS finance_receipts_expense_idx ON finance_receipts(expense_id);
CREATE INDEX IF NOT EXISTS finance_income_tenant_date_idx
  ON finance_income_records(company_id, owner_user_id, received_date);
CREATE INDEX IF NOT EXISTS finance_audit_tenant_entity_idx
  ON finance_audit_events(company_id, entity_type, entity_id);