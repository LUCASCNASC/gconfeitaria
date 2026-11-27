BEGIN;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS marketing_consent_withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_withdrawn_by bigint REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
