-- RPC: Get aggregated rates for a paginated page of countries (one row per country/upload/rate_type)
-- Returns ~50 countries * vendors * 3 types = few hundred rows, well under Supabase 1000 limit
CREATE OR REPLACE FUNCTION get_quotation_rates_page(
  p_upload_ids uuid[],
  p_country_filter text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  upload_id uuid,
  country text,
  rate_type text,
  prefixes text[],
  rate float8
)
LANGUAGE sql STABLE
AS $$
  WITH filtered AS (
    SELECT pr.upload_id, pr.country, pr.prefix, pr.rate, pr.rate_type
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
      f.rate_type,
      array_agg(DISTINCT f.prefix) AS prefixes,
      max(f.rate) AS rate
    FROM filtered f
    WHERE f.country IN (SELECT country FROM page_ctries)
    GROUP BY f.upload_id, f.country, f.rate_type
  )
  SELECT a.upload_id, a.country, a.rate_type, a.prefixes, a.rate
  FROM aggregated a
  ORDER BY a.country, a.upload_id, a.rate_type;
$$;

-- RPC: Get total count of distinct countries (for pagination)
CREATE OR REPLACE FUNCTION get_quotation_countries_count(
  p_upload_ids uuid[],
  p_country_filter text[] DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(DISTINCT pr.country)::bigint
  FROM phone_rates pr
  WHERE pr.upload_id = ANY(p_upload_ids)
    AND (p_country_filter IS NULL OR array_length(p_country_filter, 1) IS NULL
         OR EXISTS (
           SELECT 1 FROM unnest(p_country_filter) f
           WHERE LOWER(TRIM(f)) = LOWER(TRIM(pr.country))
         ))
    AND (p_search IS NULL OR p_search = '' OR LOWER(TRIM(pr.country)) LIKE '%' || LOWER(TRIM(p_search)) || '%');
$$;

-- RPC: Get distinct countries for filter dropdown (from rate data)
CREATE OR REPLACE FUNCTION get_quotation_countries_list(p_upload_ids uuid[])
RETURNS TABLE (country text)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT pr.country FROM phone_rates pr
  WHERE pr.upload_id = ANY(p_upload_ids) ORDER BY pr.country;
$$;
