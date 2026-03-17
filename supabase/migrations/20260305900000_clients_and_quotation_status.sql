-- Table: clients
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on clients" ON public.clients;
CREATE POLICY "Allow public read on clients"
  ON public.clients FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on clients" ON public.clients;
CREATE POLICY "Allow public insert on clients"
  ON public.clients FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on clients" ON public.clients;
CREATE POLICY "Allow public update on clients"
  ON public.clients FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete on clients" ON public.clients;
CREATE POLICY "Allow public delete on clients"
  ON public.clients FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_clients_name ON public.clients (name);

-- Add client_id and status to saved_quotations
ALTER TABLE public.saved_quotations
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.saved_quotations
  DROP CONSTRAINT IF EXISTS saved_quotations_status_check;
ALTER TABLE public.saved_quotations
  ADD CONSTRAINT saved_quotations_status_check CHECK (status IN ('active', 'archived'));

CREATE INDEX IF NOT EXISTS idx_saved_quotations_client_id ON public.saved_quotations (client_id);
CREATE INDEX IF NOT EXISTS idx_saved_quotations_status ON public.saved_quotations (status);
CREATE INDEX IF NOT EXISTS idx_saved_quotations_created_status ON public.saved_quotations (created_at DESC, status);
