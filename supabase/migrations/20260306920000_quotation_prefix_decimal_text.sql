-- Align DB canonical with TS: strip leading apostrophe (Excel text), normalize "9370.0" → "9370".

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
  n := regexp_replace(n, '^''+', '');
  IF n = '' THEN
    RETURN '';
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
