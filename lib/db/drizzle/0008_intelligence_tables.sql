-- Add provenance columns to existing job_production_documents table
ALTER TABLE job_production_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS extraction_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_method TEXT;

-- Cutting list / BOM components — one row per component/item
-- Sawn (nominal/purchased stock) and finished (planed/machined) dimensions stored separately.
-- RULE: sawn_*_mm is NEVER invented; it stays NULL unless the source document explicitly states it.
CREATE TABLE job_intelligence_components (
  id                    SERIAL PRIMARY KEY,
  job_id                INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  document_id           INTEGER NOT NULL REFERENCES job_production_documents(id) ON DELETE CASCADE,
  item_name             TEXT,
  quantity              NUMERIC(10,3),
  -- Finished / planed dimensions (required size after machining)
  finished_length_mm    NUMERIC(10,2),
  finished_width_mm     NUMERIC(10,2),
  finished_thickness_mm NUMERIC(10,2),
  -- Sawn / nominal dimensions (purchased stock size — NEVER calculated or inferred)
  sawn_length_mm        NUMERIC(10,2),
  sawn_width_mm         NUMERIC(10,2),
  sawn_thickness_mm     NUMERIC(10,2),
  -- Material
  material              TEXT,        -- 'timber' | 'sheet' | 'hardware' | 'other'
  timber_species        TEXT,        -- open list: Accoya, Oak, Sapele, Iroko, Tulipwood, softwood...
  timber_grade          TEXT,
  board_type            TEXT,        -- open list: MDF, MR MDF, plywood, MFC, veneered board...
  sheet_finish          TEXT,
  hardware_ref          TEXT,
  supplier_ref          TEXT,
  unit_cost             NUMERIC(10,2),
  total_cost            NUMERIC(10,2),
  notes                 TEXT,
  -- Provenance & human review
  extraction_status     TEXT NOT NULL DEFAULT 'ai_extracted',
  -- 'ai_extracted' | 'reviewed' | 'corrected' | 'manually_added'
  confidence_score      NUMERIC(4,3),  -- 0.000 – 1.000
  original_extracted_text TEXT,        -- raw AI value, preserved even after human correction
  corrected_at          TIMESTAMPTZ,
  extracted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_intel_components_job_id ON job_intelligence_components(job_id);
CREATE INDEX idx_intel_components_document_id ON job_intelligence_components(document_id);

-- Supplier invoice line items — one row per line on the invoice
CREATE TABLE job_intelligence_invoice_lines (
  id                    SERIAL PRIMARY KEY,
  job_id                INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  document_id           INTEGER NOT NULL REFERENCES job_production_documents(id) ON DELETE CASCADE,
  -- Invoice header (repeated per line for self-contained querying)
  supplier_name         TEXT,
  invoice_number        TEXT,
  invoice_date          TEXT,
  -- Line item
  item_description      TEXT,
  quantity              NUMERIC(10,3),
  unit                  TEXT,        -- 'each', 'm', 'm²', 'sheet', 'length', 'kg', etc.
  unit_price            NUMERIC(10,2),
  line_total            NUMERIC(10,2),
  vat_amount            NUMERIC(10,2),
  material_category     TEXT,
  product_ref           TEXT,
  -- Provenance & human review
  extraction_status     TEXT NOT NULL DEFAULT 'ai_extracted',
  confidence_score      NUMERIC(4,3),
  original_extracted_text TEXT,
  corrected_at          TIMESTAMPTZ,
  extracted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_intel_invoice_lines_job_id ON job_intelligence_invoice_lines(job_id);
CREATE INDEX idx_intel_invoice_lines_document_id ON job_intelligence_invoice_lines(document_id);
