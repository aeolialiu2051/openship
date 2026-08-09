-- The previous migration timestamp is already present in some databases with
-- different contents, so this migration uses a fresh timestamp in the journal.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;
