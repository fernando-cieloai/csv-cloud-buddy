-- One-query summary for comparing vendor DB rows to Excel (e.g. Grete Local Trunk Rates).
-- Line-type rules mirror src/lib/quotationNetworkSummary.ts classifyQuotationNetworkLineType.

CREATE OR REPLACE FUNCTION public.summarize_phone_rates_by_iso_line_type(
  p_vendor_id uuid DEFAULT NULL,
  p_upload_id uuid DEFAULT NULL
)
RETURNS TABLE (
  country_iso text,
  line_type text,
  min_rate numeric,
  max_rate numeric,
  avg_rate numeric,
  prefix_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT pr.country_iso, pr.network, pr.prefix, pr.rate
    FROM public.phone_rates_with_country_iso pr
    WHERE pr.country_iso IS NOT NULL
      AND length(btrim(pr.country_iso::text)) = 2
      AND (
        (p_upload_id IS NOT NULL AND pr.upload_id = p_upload_id)
        OR (
          p_upload_id IS NULL
          AND p_vendor_id IS NOT NULL
          AND pr.upload_id = (
            SELECT u.id
            FROM public.csv_uploads u
            WHERE u.vendor_id = p_vendor_id
            ORDER BY u.created_at DESC NULLS LAST
            LIMIT 1
          )
        )
        OR (p_upload_id IS NULL AND p_vendor_id IS NULL)
      )
  ),
  classified AS (
    SELECT
      lower(btrim(f.country_iso::text)) AS iso,
      CASE
        WHEN lower(coalesce(f.network, '')) LIKE '%mobile%'
          OR lower(coalesce(f.network, '')) LIKE '%cellular%' THEN 'Mobile'
        WHEN coalesce(f.network, '') ~* '[[:<:]](special|rural|other)[[:>:]]' THEN 'Other'
        ELSE 'Fixed'
      END AS lt,
      f.prefix,
      f.rate
    FROM filtered f
  )
  SELECT
    c.iso AS country_iso,
    c.lt AS line_type,
    min(c.rate)::numeric AS min_rate,
    max(c.rate)::numeric AS max_rate,
    avg(c.rate)::numeric AS avg_rate,
    count(DISTINCT c.prefix)::bigint AS prefix_count
  FROM classified c
  GROUP BY c.iso, c.lt
  ORDER BY c.iso,
    CASE c.lt WHEN 'Mobile' THEN 0 WHEN 'Fixed' THEN 1 ELSE 2 END;
$$;

COMMENT ON FUNCTION public.summarize_phone_rates_by_iso_line_type(uuid, uuid) IS
  'Min/max/avg rate and distinct prefix count by country_iso and Mobile/Fixed/Other (same heuristics as quotation network summary). Pass p_upload_id for one file, or p_vendor_id for latest csv_upload of that vendor, or both null for all rows.';

GRANT EXECUTE ON FUNCTION public.summarize_phone_rates_by_iso_line_type(uuid, uuid) TO anon, authenticated;
