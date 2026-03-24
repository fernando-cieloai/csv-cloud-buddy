-- Seed script: groups and countries (many-to-many via country_groups)
-- Run this after migrations. Idempotent: safe to run multiple times.

-- 1. Insert groups (skip if already exists)
INSERT INTO public.groups (nombre, descripcion)
SELECT v.nombre, v.descripcion
FROM (VALUES
  ('North America', 'USA, Canada, Mexico'),
  ('Central America', 'Guatemala to Panama'),
  ('Caribbean', 'Island nations'),
  ('South America', 'Brazil, Argentina, Colombia, etc.'),
  ('Western Europe', 'UK, Germany, France, Spain, etc.'),
  ('Eastern Europe', 'Poland, Ukraine, Russia, etc.'),
  ('Middle East', 'UAE, Saudi Arabia, Israel, etc.'),
  ('Asia Pacific', 'China, Japan, India, Korea, etc.'),
  ('Africa', 'South Africa, Nigeria, Egypt, etc.'),
  ('Oceania', 'Australia, New Zealand, etc.')
) AS v(nombre, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM public.groups r WHERE r.nombre = v.nombre);

-- 2. Insert countries (no group_id)
INSERT INTO public.countries (nombre)
SELECT c.nombre FROM (VALUES
  ('USA'), ('United States'), ('Canada'), ('Mexico'),
  ('Guatemala'), ('Belize'), ('Honduras'), ('El Salvador'), ('Nicaragua'), ('Costa Rica'), ('Panama'),
  ('Cuba'), ('Jamaica'), ('Haiti'), ('Dominican Republic'), ('Puerto Rico'), ('Trinidad and Tobago'), ('Bahamas'), ('Barbados'),
  ('Brazil'), ('Argentina'), ('Chile'), ('Colombia'), ('Peru'), ('Venezuela'), ('Ecuador'), ('Bolivia'), ('Paraguay'), ('Uruguay'),
  ('United Kingdom'), ('UK'), ('Germany'), ('France'), ('Spain'), ('Italy'), ('Netherlands'), ('Belgium'), ('Portugal'), ('Switzerland'), ('Austria'), ('Ireland'), ('Sweden'), ('Norway'), ('Denmark'), ('Finland'),
  ('Poland'), ('Ukraine'), ('Russia'), ('Romania'), ('Czech Republic'), ('Hungary'), ('Greece'),
  ('Turkey'), ('UAE'), ('United Arab Emirates'), ('Saudi Arabia'), ('Israel'), ('Egypt'), ('Iran'), ('Iraq'), ('Qatar'), ('Kuwait'), ('Jordan'), ('Lebanon'),
  ('China'), ('Japan'), ('India'), ('South Korea'), ('Korea'), ('Indonesia'), ('Thailand'), ('Malaysia'), ('Philippines'), ('Vietnam'), ('Singapore'), ('Hong Kong'), ('Taiwan'), ('Australia'), ('New Zealand'), ('Pakistan'), ('Bangladesh'), ('Sri Lanka'),
  ('South Africa'), ('Nigeria'), ('Kenya'), ('Morocco'), ('Ghana'), ('Tanzania'), ('Ethiopia'), ('Algeria'), ('Uganda'), ('Senegal')
) AS c(nombre)
ON CONFLICT (nombre) DO NOTHING;

-- 3. Link countries to groups via country_groups
INSERT INTO public.country_groups (country_id, group_id)
SELECT co.id, g.id
FROM (VALUES
  ('USA', 'North America'), ('United States', 'North America'), ('Canada', 'North America'), ('Mexico', 'North America'),
  ('Guatemala', 'Central America'), ('Belize', 'Central America'), ('Honduras', 'Central America'), ('El Salvador', 'Central America'),
  ('Nicaragua', 'Central America'), ('Costa Rica', 'Central America'), ('Panama', 'Central America'),
  ('Cuba', 'Caribbean'), ('Jamaica', 'Caribbean'), ('Haiti', 'Caribbean'), ('Dominican Republic', 'Caribbean'),
  ('Puerto Rico', 'Caribbean'), ('Trinidad and Tobago', 'Caribbean'), ('Bahamas', 'Caribbean'), ('Barbados', 'Caribbean'),
  ('Brazil', 'South America'), ('Argentina', 'South America'), ('Chile', 'South America'), ('Colombia', 'South America'),
  ('Peru', 'South America'), ('Venezuela', 'South America'), ('Ecuador', 'South America'), ('Bolivia', 'South America'),
  ('Paraguay', 'South America'), ('Uruguay', 'South America'),
  ('United Kingdom', 'Western Europe'), ('UK', 'Western Europe'), ('Germany', 'Western Europe'), ('France', 'Western Europe'),
  ('Spain', 'Western Europe'), ('Italy', 'Western Europe'), ('Netherlands', 'Western Europe'), ('Belgium', 'Western Europe'),
  ('Portugal', 'Western Europe'), ('Switzerland', 'Western Europe'), ('Austria', 'Western Europe'), ('Ireland', 'Western Europe'),
  ('Sweden', 'Western Europe'), ('Norway', 'Western Europe'), ('Denmark', 'Western Europe'), ('Finland', 'Western Europe'),
  ('Poland', 'Eastern Europe'), ('Ukraine', 'Eastern Europe'), ('Russia', 'Eastern Europe'), ('Romania', 'Eastern Europe'),
  ('Czech Republic', 'Eastern Europe'), ('Hungary', 'Eastern Europe'), ('Greece', 'Eastern Europe'),
  ('Turkey', 'Middle East'), ('UAE', 'Middle East'), ('United Arab Emirates', 'Middle East'), ('Saudi Arabia', 'Middle East'),
  ('Israel', 'Middle East'), ('Egypt', 'Middle East'), ('Iran', 'Middle East'), ('Iraq', 'Middle East'),
  ('Qatar', 'Middle East'), ('Kuwait', 'Middle East'), ('Jordan', 'Middle East'), ('Lebanon', 'Middle East'),
  ('China', 'Asia Pacific'), ('Japan', 'Asia Pacific'), ('India', 'Asia Pacific'), ('South Korea', 'Asia Pacific'), ('Korea', 'Asia Pacific'),
  ('Indonesia', 'Asia Pacific'), ('Thailand', 'Asia Pacific'), ('Malaysia', 'Asia Pacific'), ('Philippines', 'Asia Pacific'),
  ('Vietnam', 'Asia Pacific'), ('Singapore', 'Asia Pacific'), ('Hong Kong', 'Asia Pacific'), ('Taiwan', 'Asia Pacific'),
  ('Australia', 'Asia Pacific'), ('New Zealand', 'Asia Pacific'), ('Pakistan', 'Asia Pacific'), ('Bangladesh', 'Asia Pacific'), ('Sri Lanka', 'Asia Pacific'),
  ('South Africa', 'Africa'), ('Nigeria', 'Africa'), ('Kenya', 'Africa'), ('Morocco', 'Africa'), ('Ghana', 'Africa'),
  ('Tanzania', 'Africa'), ('Ethiopia', 'Africa'), ('Algeria', 'Africa'), ('Uganda', 'Africa'), ('Senegal', 'Africa')
) AS v(nombre, region_nombre)
JOIN public.countries co ON co.nombre = v.nombre
JOIN public.groups g ON g.nombre = v.region_nombre
ON CONFLICT (country_id, group_id) DO NOTHING;
