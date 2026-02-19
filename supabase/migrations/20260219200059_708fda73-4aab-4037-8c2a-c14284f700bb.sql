
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow public delete on phone_rates" ON public.phone_rates;
DROP POLICY IF EXISTS "Allow public insert on phone_rates" ON public.phone_rates;
DROP POLICY IF EXISTS "Allow public read access on phone_rates" ON public.phone_rates;

-- Recreate as PERMISSIVE and add UPDATE policy
CREATE POLICY "Allow public read on phone_rates"
  ON public.phone_rates FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on phone_rates"
  ON public.phone_rates FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on phone_rates"
  ON public.phone_rates FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete on phone_rates"
  ON public.phone_rates FOR DELETE
  USING (true);
