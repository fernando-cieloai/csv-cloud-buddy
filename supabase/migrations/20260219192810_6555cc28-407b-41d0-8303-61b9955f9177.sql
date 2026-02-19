
CREATE TABLE public.phone_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country TEXT NOT NULL,
  phone_company TEXT NOT NULL,
  prefix TEXT NOT NULL,
  price NUMERIC(10, 4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.phone_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on phone_rates"
  ON public.phone_rates
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on phone_rates"
  ON public.phone_rates
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public delete on phone_rates"
  ON public.phone_rates
  FOR DELETE
  USING (true);
