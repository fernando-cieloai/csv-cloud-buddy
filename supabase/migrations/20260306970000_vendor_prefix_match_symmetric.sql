-- Fix false "missing prefix" reports: match using quotation_prefix_canonical() on BOTH
-- master region_code and vendor raw prefix (same as phone_rates.prefix after parse).
-- Add NFKC to align with TypeScript String.normalize("NFKC").

CREATE OR REPLACE FUNCTION quotation_prefix_canonical(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  n text;
  ch int;
BEGIN
  n := regexp_replace(TRIM(BOTH '+' FROM TRIM(COALESCE(p, ''))), '\s', '', 'g');
  n := regexp_replace(n, '^''+', '');
  FOREACH ch IN ARRAY ARRAY[
    8203, 8204, 8205, 8206, 8207,
    8234, 8235, 8236, 8237, 8238,
    8288, 8294, 8295, 8296, 8297,
    65279
  ]
  LOOP
    n := replace(n, chr(ch), '');
  END LOOP;
  IF n = '' THEN
    RETURN '';
  END IF;
  BEGIN
    -- Second arg is a keyword (Unicode normalization form), not a string literal.
    n := normalize(n, NFKC);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  IF n = '' THEN
    RETURN '';
  END IF;
  IF n ~ '^[0-9]{1,3}(,[0-9]{3})+$' THEN
    n := replace(n, ',', '');
  END IF;
  IF n ~ '^[0-9]+\.[0-9]+$' THEN
    BEGIN
      IF (n::numeric = trunc(n::numeric)) THEN
        n := trunc(n::numeric)::text;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  IF n = '' THEN
    RETURN '';
  END IF;
  IF n LIKE '011%' THEN
    n := substring(n from 4);
  ELSIF n LIKE '11%' THEN
    n := substring(n from 3);
  END IF;
  WHILE length(n) > 1 AND n ~ '^[0-9]+$' AND substring(n from 1 for 1) = '0' LOOP
    n := substring(n from 2);
  END LOOP;
  RETURN n;
END;
$$;

-- Return type / OUT params changed vs older DBs — must drop (CASCADE clears dependents if any).
DROP FUNCTION IF EXISTS public.resolve_vendor_prefixes_in_master(text[]) CASCADE;

CREATE FUNCTION public.resolve_vendor_prefixes_in_master(p_raw_prefixes text[])
RETURNS TABLE(region_code text, country_name text)
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (quotation_prefix_canonical(cr.region_code))
    cr.region_code::text AS region_code,
    COALESCE(c.nombre, '')::text AS country_name
  FROM public.country_regions cr
  LEFT JOIN public.countries c ON c.id = cr.country_id
  WHERE cardinality(p_raw_prefixes) > 0
    AND quotation_prefix_canonical(cr.region_code) IN (
      SELECT DISTINCT quotation_prefix_canonical(btrim(t.x::text))
      FROM unnest(p_raw_prefixes) AS t(x)
      WHERE t.x IS NOT NULL AND btrim(t.x::text) <> ''
    )
  ORDER BY quotation_prefix_canonical(cr.region_code), cr.id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_vendor_prefixes_in_master(text[]) TO anon, authenticated;

-- quotation_prefix_canonical changed; refresh expression index so lookups stay correct.
REINDEX INDEX public.idx_country_regions_quotation_prefix_canonical;
