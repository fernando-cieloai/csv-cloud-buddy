-- Add rate_type for multi-sheet XLSX (International, Origin Based, Local)
ALTER TABLE public.phone_rates
  ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'International';

UPDATE public.phone_rates SET rate_type = 'International' WHERE rate_type IS NULL;
ALTER TABLE public.phone_rates ALTER COLUMN rate_type SET NOT NULL;

DROP INDEX IF EXISTS phone_rates_upload_key;
CREATE UNIQUE INDEX phone_rates_upload_key ON public.phone_rates (upload_id, country, network, prefix, rate_type);
