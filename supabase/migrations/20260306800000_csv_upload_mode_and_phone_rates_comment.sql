-- Upload mode: full replace vs merge (field updates guided by comment column)
ALTER TABLE public.csv_uploads
  ADD COLUMN IF NOT EXISTS upload_mode text NOT NULL DEFAULT 'replace'
  CHECK (upload_mode IN ('replace', 'merge'));

COMMENT ON COLUMN public.csv_uploads.upload_mode IS 'replace = full file replace; merge = update existing rows by comment column';

-- Per-row change hint from vendor file (merge mode); stored for audit in replace mode too
ALTER TABLE public.phone_rates
  ADD COLUMN IF NOT EXISTS comment text NULL;

COMMENT ON COLUMN public.phone_rates.comment IS 'No changes | Increment | Decrement | New brand (vendor CSV column)';
