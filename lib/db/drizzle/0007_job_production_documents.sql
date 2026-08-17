-- Production documents table for completed jobs
-- Separate table (not a JSON array on jobs) so:
--   1. Each document can carry metadata (name, type, size)
--   2. Deletion is a single DELETE without read-modify-write races
--   3. Future Cost Intelligence can add extracted_data columns without touching jobs

CREATE TABLE IF NOT EXISTS "job_production_documents" (
  "id"              SERIAL PRIMARY KEY,
  "job_id"          INTEGER NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "url"             TEXT NOT NULL,
  "object_path"     TEXT NOT NULL,
  "original_name"   TEXT NOT NULL,
  "mime_type"       TEXT NOT NULL,
  "doc_type"        TEXT NOT NULL,
  "file_size_bytes" INTEGER,
  "uploaded_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "extracted_data"  JSONB
);

CREATE INDEX IF NOT EXISTS "job_production_documents_job_id_idx"
  ON "job_production_documents"("job_id");
