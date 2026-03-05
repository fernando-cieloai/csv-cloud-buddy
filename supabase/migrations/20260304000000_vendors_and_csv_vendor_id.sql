-- Enum for vendor status (optional; we use CHECK for simplicity)
-- Table: vendors (proveedores de tarifas)
CREATE TABLE IF NOT EXISTS public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'activado' CHECK (estado IN ('activado', 'desactivado')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on vendors" ON public.vendors;
CREATE POLICY "Allow public read on vendors"
  ON public.vendors FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on vendors" ON public.vendors;
CREATE POLICY "Allow public insert on vendors"
  ON public.vendors FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on vendors" ON public.vendors;
CREATE POLICY "Allow public update on vendors"
  ON public.vendors FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on vendors" ON public.vendors;
CREATE POLICY "Allow public delete on vendors"
  ON public.vendors FOR DELETE USING (true);

-- Assign a vendor to a CSV upload
ALTER TABLE public.csv_uploads
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_csv_uploads_vendor_id ON public.csv_uploads (vendor_id);

-- Allow updating csv_uploads (e.g. to set vendor_id)
DROP POLICY IF EXISTS "Allow public update on csv_uploads" ON public.csv_uploads;
CREATE POLICY "Allow public update on csv_uploads"
  ON public.csv_uploads FOR UPDATE USING (true) WITH CHECK (true);
