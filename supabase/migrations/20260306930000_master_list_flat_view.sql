-- Flatten country_regions + countries so the Master List UI can filter, sort, and count
-- without PostgREST "order on embedded resource" failures.

CREATE OR REPLACE VIEW public.master_list_flat
WITH (security_invoker = true) AS
SELECT
  cr.id,
  cr.region,
  cr.region_code,
  cr.effective_date,
  cr.valid_to,
  cr.date_added,
  c.nombre AS country_name
FROM public.country_regions cr
LEFT JOIN public.countries c ON c.id = cr.country_id;

GRANT SELECT ON public.master_list_flat TO anon, authenticated;
