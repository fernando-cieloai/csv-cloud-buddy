-- Table: saved_quotations (cotizaciones guardadas)
CREATE TABLE IF NOT EXISTS public.saved_quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  vendor_ids UUID[] NOT NULL DEFAULT '{}',
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on saved_quotations" ON public.saved_quotations;
CREATE POLICY "Allow public read on saved_quotations"
  ON public.saved_quotations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on saved_quotations" ON public.saved_quotations;
CREATE POLICY "Allow public insert on saved_quotations"
  ON public.saved_quotations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on saved_quotations" ON public.saved_quotations;
CREATE POLICY "Allow public update on saved_quotations"
  ON public.saved_quotations FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on saved_quotations" ON public.saved_quotations;
CREATE POLICY "Allow public delete on saved_quotations"
  ON public.saved_quotations FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_saved_quotations_created_at ON public.saved_quotations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_quotations_vendor_ids ON public.saved_quotations USING GIN (vendor_ids);
