-- Table: each uploaded file is one object (idempotent)
CREATE TABLE IF NOT EXISTS public.csv_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.csv_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on csv_uploads" ON public.csv_uploads;
CREATE POLICY "Allow public read on csv_uploads"
  ON public.csv_uploads FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on csv_uploads" ON public.csv_uploads;
CREATE POLICY "Allow public insert on csv_uploads"
  ON public.csv_uploads FOR INSERT WITH CHECK (true);

-- Add upload_id to phone_rates only if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'phone_rates' AND column_name = 'upload_id'
  ) THEN
    ALTER TABLE public.phone_rates
      ADD COLUMN upload_id UUID REFERENCES public.csv_uploads(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill: one "Legacy" upload for existing rows (only if we have rows without upload_id)
INSERT INTO public.csv_uploads (id, file_name, created_at)
  SELECT gen_random_uuid(), 'Importación anterior', now() - interval '1 year'
  FROM (SELECT 1) x
  WHERE NOT EXISTS (SELECT 1 FROM public.csv_uploads WHERE file_name = 'Importación anterior')
    AND EXISTS (SELECT 1 FROM public.phone_rates WHERE upload_id IS NULL);

UPDATE public.phone_rates
  SET upload_id = (SELECT id FROM public.csv_uploads WHERE file_name = 'Importación anterior' LIMIT 1)
  WHERE upload_id IS NULL;

ALTER TABLE public.phone_rates
  ALTER COLUMN upload_id SET NOT NULL;

-- Drop old unique constraint so same (country, company, prefix) can exist per upload
ALTER TABLE public.phone_rates
  DROP CONSTRAINT IF EXISTS phone_rates_unique_key;

-- Unique per upload (same file cannot have duplicate keys)
CREATE UNIQUE INDEX IF NOT EXISTS phone_rates_upload_key ON public.phone_rates (upload_id, country, phone_company, prefix);
