-- Table: regions
CREATE TABLE IF NOT EXISTS public.regions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on regions" ON public.regions;
CREATE POLICY "Allow public read on regions"
  ON public.regions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on regions" ON public.regions;
CREATE POLICY "Allow public insert on regions"
  ON public.regions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on regions" ON public.regions;
CREATE POLICY "Allow public update on regions"
  ON public.regions FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on regions" ON public.regions;
CREATE POLICY "Allow public delete on regions"
  ON public.regions FOR DELETE USING (true);

-- Table: countries (links to regions)
CREATE TABLE IF NOT EXISTS public.countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on countries" ON public.countries;
CREATE POLICY "Allow public read on countries"
  ON public.countries FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on countries" ON public.countries;
CREATE POLICY "Allow public insert on countries"
  ON public.countries FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on countries" ON public.countries;
CREATE POLICY "Allow public update on countries"
  ON public.countries FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on countries" ON public.countries;
CREATE POLICY "Allow public delete on countries"
  ON public.countries FOR DELETE USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_countries_nombre_unique ON public.countries (nombre);
CREATE INDEX IF NOT EXISTS idx_countries_region_id ON public.countries (region_id);
