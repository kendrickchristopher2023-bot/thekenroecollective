ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Celebrations',
  ADD COLUMN IF NOT EXISTS category_order integer NOT NULL DEFAULT 10;

UPDATE public.ventures SET category = 'Celebrations', category_order = 10, sort_order = 10 WHERE name = 'Events & Gatherings';
UPDATE public.ventures SET category = 'Celebrations', category_order = 10, sort_order = 20 WHERE name = 'Group eCards';
UPDATE public.ventures SET category = 'The Workroom', category_order = 20, sort_order = 30 WHERE name = 'Projects';
UPDATE public.ventures SET category = 'Career', category_order = 30, sort_order = 40 WHERE name = 'AI Resume Wizard';