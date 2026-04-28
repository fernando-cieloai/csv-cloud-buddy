-- Stable country filter: ISO (country_iso) from vendor country label (hyphen head + map),
-- plus country_match_key (same logic as quotation RPCs). Filter with country_iso = 'mx'
-- regardless of MEXICO / Mexico / MEXICO-CELLULAR… spelling in phone_rates.country.

CREATE OR REPLACE VIEW public.phone_rates_with_country_iso AS
SELECT
  pr.*,
  quotation_country_direct_iso_prefix(pr.country) AS country_iso,
  quotation_country_row_match_key(pr.network, pr.country) AS country_match_key
FROM public.phone_rates pr;

COMMENT ON VIEW public.phone_rates_with_country_iso IS
  'phone_rates plus country_iso (2-letter when recognized from country column head) and country_match_key (ISO or network token). Example: WHERE country_iso = ''mx'' for all Mexico variants.';
