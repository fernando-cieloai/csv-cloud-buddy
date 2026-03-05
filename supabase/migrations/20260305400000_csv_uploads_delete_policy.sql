-- Allow deleting csv_uploads (needed when replacing upload per vendor)
DROP POLICY IF EXISTS "Allow public delete on csv_uploads" ON public.csv_uploads;
CREATE POLICY "Allow public delete on csv_uploads"
  ON public.csv_uploads FOR DELETE USING (true);
