-- Table: country_regions - stores Country, Region, RegionCode from uploaded files
-- Used for master list of countries with their regions and dialing prefixes
CREATE TABLE IF NOT EXISTS public.country_regions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  region_code TEXT NOT NULL,
  effective_date DATE,
  valid_to DATE,
  date_added DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.country_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on country_regions"
  ON public.country_regions FOR SELECT USING (true);

CREATE POLICY "Allow public insert on country_regions"
  ON public.country_regions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on country_regions"
  ON public.country_regions FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete on country_regions"
  ON public.country_regions FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_country_regions_country_id ON public.country_regions (country_id);
CREATE INDEX IF NOT EXISTS idx_country_regions_region_code ON public.country_regions (region_code);
ALTER TABLE public.country_regions
  ADD CONSTRAINT country_regions_country_region_code_unique UNIQUE (country_id, region, region_code);
