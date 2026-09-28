CREATE TABLE public.business_cards (
  slug text PRIMARY KEY,
  full_name text NOT NULL,
  role text NOT NULL,
  organisation text NOT NULL DEFAULT 'The Kenroe Collective',
  email text NOT NULL,
  phone text,
  website text NOT NULL DEFAULT 'https://thekenroecollective.com',
  photo_url text,
  show_phone_on_page boolean NOT NULL DEFAULT false,
  tagline text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.business_cards TO anon;
GRANT SELECT ON public.business_cards TO authenticated;
GRANT ALL ON public.business_cards TO service_role;

ALTER TABLE public.business_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business cards are public to read"
  ON public.business_cards FOR SELECT
  USING (true);

CREATE POLICY "Owners manage business cards"
  ON public.business_cards FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.card_scans
  ADD COLUMN IF NOT EXISTS card_slug text,
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'scan';

CREATE INDEX IF NOT EXISTS card_scans_action_created_idx ON public.card_scans (action, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_card_scan(_destination text, _source text DEFAULT 'business-card'::text, _card_slug text DEFAULT NULL::text, _action text DEFAULT 'scan'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.card_scans (destination, source, card_slug, action)
  VALUES (
    left(coalesce(_destination, ''), 500),
    left(coalesce(_source, 'business-card'), 60),
    left(nullif(_card_slug, ''), 60),
    CASE WHEN _action = 'save' THEN 'save' ELSE 'scan' END
  );
END;
$function$;

INSERT INTO public.business_cards (slug, full_name, role, email, phone, website, show_phone_on_page, sort_order)
VALUES
  ('christopher', 'Christopher Kendrick', 'Founder', 'concierge@thekenroecollective.com', '+19802360667', 'https://thekenroecollective.com', false, 1),
  ('adrian', 'Adrian Monroe', 'Founder', 'concierge@thekenroecollective.com', '+19802360667', 'https://thekenroecollective.com', false, 2)
ON CONFLICT (slug) DO NOTHING;