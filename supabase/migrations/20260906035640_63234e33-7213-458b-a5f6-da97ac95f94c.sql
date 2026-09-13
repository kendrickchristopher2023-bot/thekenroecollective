ALTER TABLE public.business_cards
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;

ALTER TABLE public.business_cards ALTER COLUMN full_name SET DEFAULT '';
ALTER TABLE public.business_cards ALTER COLUMN role SET DEFAULT '';
ALTER TABLE public.business_cards ALTER COLUMN email SET DEFAULT '';