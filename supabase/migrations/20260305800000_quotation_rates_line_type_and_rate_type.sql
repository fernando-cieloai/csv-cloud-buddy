-- Add line_type (mobile/landline/others) as 3 rows per country, keep rate_type (International, Origin Based, Local) as columns
DROP FUNCTION IF EXISTS get_quotation_rates_page(uuid[], text[], text, integer, integer);

CREATE FUNCTION get_quotation_rates_page(
  p_upload_ids uuid[],
  p_country_filter text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  upload_id uuid,
  country text,
  line_type text,
  rate_type text,
  prefixes text[],
  rate float8
)
LANGUAGE sql STABLE
AS $$
  WITH filtered AS (
    SELECT
      pr.upload_id,
      pr.country,
      pr.prefix,
      pr.rate,
      COALESCE(NULLIF(TRIM(pr.rate_type), ''), 'International') AS rate_type,
      CASE
        WHEN LOWER(COALESCE(pr.network, '')) ~ '(mobile|móvil|movil|celular|cellular|wireless|gsm)' THEN 'mobile'
        WHEN LOWER(COALESCE(pr.network, '')) ~ '(fixed|fijo|landline|land.?line|pstn)' THEN 'landline'
        ELSE 'others'
      END AS line_type
    FROM phone_rates pr
    WHERE pr.upload_id = ANY(p_upload_ids)
      AND (p_country_filter IS NULL OR array_length(p_country_filter, 1) IS NULL
           OR EXISTS (
             SELECT 1 FROM unnest(p_country_filter) f
             WHERE LOWER(TRIM(f)) = LOWER(TRIM(pr.country))
           ))
      AND (p_search IS NULL OR p_search = '' OR LOWER(TRIM(pr.country)) LIKE '%' || LOWER(TRIM(p_search)) || '%')
  ),
  distinct_ctries AS (
    SELECT DISTINCT country FROM filtered
  ),
  ordered_ctries AS (
    SELECT country FROM distinct_ctries ORDER BY country
  ),
  page_ctries AS (
    SELECT country FROM ordered_ctries LIMIT p_limit OFFSET p_offset
  ),
  aggregated AS (
    SELECT
      f.upload_id,
      f.country,
      f.line_type,
      f.rate_type,
      array_agg(DISTINCT f.prefix) AS prefixes,
      max(f.rate) AS rate
    FROM filtered f
    WHERE f.country IN (SELECT country FROM page_ctries)
    GROUP BY f.upload_id, f.country, f.line_type, f.rate_type
  )
  SELECT a.upload_id, a.country, a.line_type, a.rate_type, a.prefixes, a.rate
  FROM aggregated a
  ORDER BY a.country, a.upload_id, a.line_type, a.rate_type;
$$;
