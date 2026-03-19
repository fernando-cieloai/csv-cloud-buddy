-- Derive line_type (Type in quotations) from country_regions.region when prefix matches
-- mobile: region contains mobile, cellphone, celular, etc.
-- landline: region contains landline, proper, fixed, etc.
-- special: rest (not mobile/landline)
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
  WITH prefix_regions AS (
    SELECT DISTINCT ON (norm_prefix)
      norm_prefix,
      region
    FROM (
      SELECT
        TRIM(BOTH '+' FROM TRIM(cr.region_code)) AS norm_prefix,
        cr.region
      FROM country_regions cr
    ) x
    WHERE norm_prefix <> ''
    ORDER BY norm_prefix, region
  ),
  filtered AS (
    SELECT
      pr.upload_id,
      pr.country,
      pr.prefix,
      pr.rate,
      COALESCE(NULLIF(TRIM(pr.rate_type), ''), 'International') AS rate_type,
      CASE
        WHEN pr2.region IS NOT NULL AND LOWER(pr2.region) ~ '(mobile|cellphone|celular|cellular|wireless|gsm|móvil|movil)' THEN 'mobile'
        WHEN pr2.region IS NOT NULL AND LOWER(pr2.region) ~ '(landline|proper|fixed|fijo|pstn|land\s*line)' THEN 'landline'
        WHEN pr2.region IS NOT NULL THEN 'special'
        WHEN LOWER(COALESCE(pr.network, '')) ~ '(mobile|móvil|movil|celular|cellular|wireless|gsm)' THEN 'mobile'
        WHEN LOWER(COALESCE(pr.network, '')) ~ '(fixed|fijo|landline|land.?line|pstn)' THEN 'landline'
        ELSE 'special'
      END AS line_type
    FROM phone_rates pr
    LEFT JOIN prefix_regions pr2 ON TRIM(BOTH '+' FROM TRIM(pr.prefix)) = pr2.norm_prefix
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
