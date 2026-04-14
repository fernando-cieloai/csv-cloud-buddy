-- Stronger prefix canonicalization: strip whitespace, repeat "11" prefix removal,
-- strip leading national 0 on all-digit codes (aligns TS with quotationPrefixCanonical.ts).

CREATE OR REPLACE FUNCTION quotation_prefix_canonical(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  n text;
BEGIN
  n := regexp_replace(TRIM(BOTH '+' FROM TRIM(COALESCE(p, ''))), '\s', '', 'g');
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
