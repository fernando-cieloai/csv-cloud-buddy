-- Many-to-many: countries can belong to multiple groups via country_groups

-- 1. Create junction table
CREATE TABLE IF NOT EXISTS public.country_groups (
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (country_id, group_id)
);

ALTER TABLE public.country_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on country_groups"
  ON public.country_groups FOR SELECT USING (true);

CREATE POLICY "Allow public insert on country_groups"
  ON public.country_groups FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on country_groups"
  ON public.country_groups FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete on country_groups"
  ON public.country_groups FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_country_groups_country_id ON public.country_groups (country_id);
CREATE INDEX IF NOT EXISTS idx_country_groups_group_id ON public.country_groups (group_id);

-- 2. Migrate existing group_id data
INSERT INTO public.country_groups (country_id, group_id)
SELECT id, group_id FROM public.countries WHERE group_id IS NOT NULL
ON CONFLICT (country_id, group_id) DO NOTHING;

-- 3. Remove group_id from countries
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_group_id_fkey;
ALTER TABLE public.countries DROP COLUMN IF EXISTS group_id;
DROP INDEX IF EXISTS idx_countries_group_id;
