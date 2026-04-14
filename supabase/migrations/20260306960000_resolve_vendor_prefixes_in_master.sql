-- Expression index for fast prefix lookups on country_regions.
-- RPC resolve_vendor_prefixes_in_master is defined in 20260306970000 (single definition avoids REPLACE return-type errors).

CREATE INDEX IF NOT EXISTS idx_country_regions_quotation_prefix_canonical
  ON public.country_regions (quotation_prefix_canonical(region_code));
