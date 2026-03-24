-- Group by network + rate instead of line_type. Same network with different prices = separate rows.
-- Returns network (region from country_regions or phone_rates.network) instead of line_type.
DROP FUNCTION IF EXISTS get_quotation_rates_page(uuid[], text[], text, integer, integer, text);
DROP FUNCTION IF EXISTS get_quotation_countries_count(uuid[], text[], text, text);

CREATE FUNCTION get_quotation_rates_page(
  p_upload_ids uuid[],
  p_country_filter text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_search_by text DEFAULT 'country'
)
RETURNS TABLE (
  upload_id uuid,
  country text,
  network text,
  rate_type text,
  prefixes text[],
  rate float8,
  from_master_list boolean
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
  with_network AS (
    SELECT
      pr.upload_id,
      pr.country,
      pr.prefix,
      pr.rate,
      COALESCE(NULLIF(TRIM(pr.rate_type), ''), 'International') AS rate_type,
      COALESCE(NULLIF(TRIM(pr2.region), ''), NULLIF(TRIM(pr.network), ''), 'Unknown') AS network,
      (pr2.region IS NOT NULL AND NULLIF(TRIM(pr2.region), '') IS NOT NULL) AS from_master_list
    FROM phone_rates pr
    LEFT JOIN prefix_regions pr2 ON TRIM(BOTH '+' FROM TRIM(pr.prefix)) = pr2.norm_prefix
    WHERE pr.upload_id = ANY(p_upload_ids)
      AND (p_country_filter IS NULL OR array_length(p_country_filter, 1) IS NULL
           OR EXISTS (
             SELECT 1 FROM unnest(p_country_filter) f
             WHERE LOWER(TRIM(f)) = LOWER(TRIM(pr.country))
           ))
  ),
  filtered AS (
    SELECT *
    FROM with_network
    WHERE (p_search IS NULL OR p_search = '')
       OR (COALESCE(NULLIF(TRIM(LOWER(p_search_by)), ''), 'country') = 'country'
           AND LOWER(TRIM(country)) LIKE '%' || LOWER(TRIM(p_search)) || '%')
       OR (COALESCE(NULLIF(TRIM(LOWER(p_search_by)), ''), 'country') = 'prefix'
           AND LOWER(TRIM(BOTH '+' FROM TRIM(prefix))) LIKE '%' || LOWER(TRIM(p_search)) || '%')
       OR (COALESCE(NULLIF(TRIM(LOWER(p_search_by)), ''), 'country') = 'type'
           AND LOWER(TRIM(network)) LIKE '%' || LOWER(TRIM(p_search)) || '%')
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
      f.network,
      f.rate_type,
      array_agg(DISTINCT f.prefix) AS prefixes,
      f.rate,
      BOOL_OR(f.from_master_list) AS from_master_list
    FROM filtered f
    WHERE f.country IN (SELECT country FROM page_ctries)
    GROUP BY f.upload_id, f.country, f.network, f.rate_type, f.rate
  )
  SELECT a.upload_id, a.country, a.network, a.rate_type, a.prefixes, a.rate, a.from_master_list
  FROM aggregated a
  ORDER BY a.country, a.upload_id, a.network, a.rate, a.rate_type;
$$;

CREATE FUNCTION get_quotation_countries_count(
  p_upload_ids uuid[],
  p_country_filter text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_search_by text DEFAULT 'country'
)
RETURNS bigint
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
  with_network AS (
    SELECT
      pr.upload_id,
      pr.country,
      pr.prefix,
      COALESCE(NULLIF(TRIM(pr2.region), ''), NULLIF(TRIM(pr.network), ''), 'Unknown') AS network
    FROM phone_rates pr
    LEFT JOIN prefix_regions pr2 ON TRIM(BOTH '+' FROM TRIM(pr.prefix)) = pr2.norm_prefix
    WHERE pr.upload_id = ANY(p_upload_ids)
      AND (p_country_filter IS NULL OR array_length(p_country_filter, 1) IS NULL
           OR EXISTS (
             SELECT 1 FROM unnest(p_country_filter) f
             WHERE LOWER(TRIM(f)) = LOWER(TRIM(pr.country))
           ))
  ),
  filtered AS (
    SELECT country
    FROM with_network
    WHERE (p_search IS NULL OR p_search = '')
       OR (COALESCE(NULLIF(TRIM(LOWER(p_search_by)), ''), 'country') = 'country'
           AND LOWER(TRIM(country)) LIKE '%' || LOWER(TRIM(p_search)) || '%')
       OR (COALESCE(NULLIF(TRIM(LOWER(p_search_by)), ''), 'country') = 'prefix'
           AND LOWER(TRIM(BOTH '+' FROM TRIM(prefix))) LIKE '%' || LOWER(TRIM(p_search)) || '%')
       OR (COALESCE(NULLIF(TRIM(LOWER(p_search_by)), ''), 'country') = 'type'
           AND LOWER(TRIM(network)) LIKE '%' || LOWER(TRIM(p_search)) || '%')
  )
  SELECT COUNT(DISTINCT country)::bigint FROM filtered;
$$;
