-- Rename regions table to groups and countries.region_id to group_id

-- 1. Rename table regions -> groups
ALTER TABLE public.regions RENAME TO groups;

-- 2. Update RLS policies (drop old, create new with groups)
DROP POLICY IF EXISTS "Allow public read on regions" ON public.groups;
CREATE POLICY "Allow public read on groups" ON public.groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on regions" ON public.groups;
CREATE POLICY "Allow public insert on groups" ON public.groups FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on regions" ON public.groups;
CREATE POLICY "Allow public update on groups" ON public.groups FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on regions" ON public.groups;
CREATE POLICY "Allow public delete on groups" ON public.groups FOR DELETE USING (true);

-- 3. Rename countries.region_id -> group_id and update FK
ALTER TABLE public.countries RENAME COLUMN region_id TO group_id;

-- Update FK constraint to reference groups
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_region_id_fkey;
ALTER TABLE public.countries
  ADD CONSTRAINT countries_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;

-- 4. Rename index for clarity
DROP INDEX IF EXISTS idx_countries_region_id;
CREATE INDEX IF NOT EXISTS idx_countries_group_id ON public.countries (group_id);
