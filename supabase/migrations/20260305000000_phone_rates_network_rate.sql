-- Rename columns to: country, network, prefix, rate
ALTER TABLE public.phone_rates RENAME COLUMN phone_company TO network;
ALTER TABLE public.phone_rates RENAME COLUMN price TO rate;

-- Recreate unique index with new column name
DROP INDEX IF EXISTS phone_rates_upload_key;
CREATE UNIQUE INDEX phone_rates_upload_key ON public.phone_rates (upload_id, country, network, prefix);
