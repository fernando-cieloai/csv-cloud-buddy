ALTER TABLE public.phone_rates
ADD CONSTRAINT phone_rates_unique_key
UNIQUE (country, phone_company, prefix);