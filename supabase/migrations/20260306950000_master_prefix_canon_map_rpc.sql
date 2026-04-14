-- Single-query master prefix index for vendor uploads (avoids many paginated REST round trips).
-- Align 011 / 11 stripping with TS canonicalPrefixForMasterMatch (one pass each).

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

CREATE OR REPLACE FUNCTION public.list_master_prefix_canon_map()
RETURNS TABLE(canonical_prefix text, country_name text)
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (t.canon)
    t.canon AS canonical_prefix,
    COALESCE(t.nombre, '')::text AS country_name
  FROM (
    SELECT
      quotation_prefix_canonical(cr.region_code) AS canon,
      c.nombre AS nombre,
      cr.id AS id
    FROM public.country_regions cr
    LEFT JOIN public.countries c ON c.id = cr.country_id
  ) t
  WHERE t.canon <> ''
  ORDER BY t.canon, t.id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_master_prefix_canon_map() TO anon, authenticated;
