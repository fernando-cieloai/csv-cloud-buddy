-- Country filter: match catalog country OR first segment of vendor file network (e.g. PANAMA-CELLULAR → PANAMA).
-- Adds country_filter_key on rates RPC for client-side aggregation.

DROP FUNCTION IF EXISTS get_quotation_rates_page(uuid[], text[], text, integer, integer, text);
DROP FUNCTION IF EXISTS get_quotation_networks_count(uuid[], text[], text, text);
DROP FUNCTION IF EXISTS get_quotation_country_filter_labels(uuid[]);

CREATE OR REPLACE FUNCTION get_quotation_rates_page(
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
  from_master_list boolean,
  country_filter_key text
)
LANGUAGE sql
STABLE
SET statement_timeout = '120s'
AS $$
  WITH prefix_regions AS (
    SELECT DISTINCT ON (canon)
      canon,
      region
    FROM (
      SELECT
        quotation_prefix_canonical(TRIM(BOTH '+' FROM TRIM(cr.region_code))) AS canon,
        cr.region
      FROM country_regions cr
    ) x
    WHERE canon <> ''
    ORDER BY canon, region
  ),
  with_network AS (
    SELECT
      pr.upload_id,
      pr.country,
      pr.prefix,
      pr.rate,
      COALESCE(NULLIF(TRIM(pr.rate_type), ''), 'International') AS rate_type,
      COALESCE(NULLIF(TRIM(pr.network), ''), NULLIF(TRIM(pr2.region), ''), 'Unknown') AS network,
      (pr2.region IS NOT NULL AND NULLIF(TRIM(pr2.region), '') IS NOT NULL) AS from_master_list,
      LOWER(TRIM(COALESCE(
        NULLIF(TRIM(SPLIT_PART(NULLIF(TRIM(pr.network), ''), '-', 1)), ''),
        NULLIF(TRIM(pr.country), '')
      ))) AS country_filter_key
    FROM phone_rates pr
    LEFT JOIN prefix_regions pr2
      ON quotation_prefix_canonical(TRIM(BOTH '+' FROM TRIM(pr.prefix))) = pr2.canon
    WHERE pr.upload_id = ANY(p_upload_ids)
      AND (
        p_country_filter IS NULL
        OR array_length(p_country_filter, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(p_country_filter) AS f(lbl)
          WHERE LOWER(TRIM(lbl)) = LOWER(TRIM(pr.country))
             OR (
               NULLIF(TRIM(pr.network), '') IS NOT NULL
               AND LOWER(TRIM(lbl)) = LOWER(TRIM(SPLIT_PART(TRIM(pr.network), '-', 1)))
             )
        )
      )
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
  aggregated AS (
    SELECT
      f.upload_id,
      f.country,
      f.network,
      f.rate_type,
      array_agg(DISTINCT f.prefix) AS prefixes,
      f.rate,
      BOOL_OR(f.from_master_list) AS from_master_list,
      MIN(f.country_filter_key) AS country_filter_key
    FROM filtered f
    GROUP BY f.upload_id, f.country, f.network, f.rate_type, f.rate
  ),
  ordered AS (
    SELECT
      a.upload_id,
      a.country,
      a.network,
      a.rate_type,
      a.prefixes,
      a.rate,
      a.from_master_list,
      a.country_filter_key
    FROM aggregated a
    ORDER BY a.country NULLS LAST, a.upload_id, a.network, a.rate, a.rate_type
  )
  SELECT o.upload_id, o.country, o.network, o.rate_type, o.prefixes, o.rate, o.from_master_list, o.country_filter_key
  FROM ordered o
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION get_quotation_networks_count(
  p_upload_ids uuid[],
  p_country_filter text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_search_by text DEFAULT 'country'
)
RETURNS bigint
LANGUAGE sql
STABLE
SET statement_timeout = '120s'
AS $$
  WITH prefix_regions AS (
    SELECT DISTINCT ON (canon)
      canon,
      region
    FROM (
      SELECT
        quotation_prefix_canonical(TRIM(BOTH '+' FROM TRIM(cr.region_code))) AS canon,
        cr.region
      FROM country_regions cr
    ) x
    WHERE canon <> ''
    ORDER BY canon, region
  ),
  with_network AS (
    SELECT
      pr.upload_id,
      pr.country,
      pr.prefix,
      pr.rate,
      COALESCE(NULLIF(TRIM(pr.rate_type), ''), 'International') AS rate_type,
      COALESCE(NULLIF(TRIM(pr.network), ''), NULLIF(TRIM(pr2.region), ''), 'Unknown') AS network
    FROM phone_rates pr
    LEFT JOIN prefix_regions pr2
      ON quotation_prefix_canonical(TRIM(BOTH '+' FROM TRIM(pr.prefix))) = pr2.canon
    WHERE pr.upload_id = ANY(p_upload_ids)
      AND (
        p_country_filter IS NULL
        OR array_length(p_country_filter, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(p_country_filter) AS f(lbl)
          WHERE LOWER(TRIM(lbl)) = LOWER(TRIM(pr.country))
             OR (
               NULLIF(TRIM(pr.network), '') IS NOT NULL
               AND LOWER(TRIM(lbl)) = LOWER(TRIM(SPLIT_PART(TRIM(pr.network), '-', 1)))
             )
        )
      )
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
  aggregated AS (
    SELECT 1
    FROM filtered f
    GROUP BY f.upload_id, f.country, f.network, f.rate_type, f.rate
  )
  SELECT COUNT(*)::bigint FROM aggregated;
$$;

CREATE OR REPLACE FUNCTION get_quotation_country_filter_labels(p_upload_ids uuid[])
RETURNS TABLE (label text)
LANGUAGE sql
STABLE
SET statement_timeout = '60s'
AS $$
  SELECT y.label
  FROM (
    SELECT DISTINCT trim(both from x.lbl)::text AS label
    FROM (
      SELECT COALESCE(
        NULLIF(TRIM(SPLIT_PART(NULLIF(TRIM(pr.network), ''), '-', 1)), ''),
        NULLIF(TRIM(pr.country), '')
      ) AS lbl
      FROM phone_rates pr
      WHERE pr.upload_id = ANY(p_upload_ids)
    ) x
    WHERE trim(both from x.lbl) <> ''
  ) y
  ORDER BY lower(y.label), y.label;
$$;
