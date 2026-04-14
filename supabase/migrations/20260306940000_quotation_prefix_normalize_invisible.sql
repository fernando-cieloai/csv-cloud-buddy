-- Match TS normalizePrefixRaw: strip invisible/bidi chars and US-style thousands in region_code/prefix.

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
  WHILE n LIKE '011%' LOOP
    n := substring(n from 4);
  END LOOP;
  WHILE length(n) > 3 AND n LIKE '11%' LOOP
    n := substring(n from 3);
  END LOOP;
  WHILE length(n) > 1 AND n ~ '^[0-9]+$' AND substring(n from 1 for 1) = '0' LOOP
    n := substring(n from 2);
  END LOOP;
  RETURN n;
END;
$$;
