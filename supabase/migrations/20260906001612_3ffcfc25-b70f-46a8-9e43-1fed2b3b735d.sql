ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS card_destination text,
  ADD COLUMN IF NOT EXISTS card_campaign text;

CREATE TABLE IF NOT EXISTS public.card_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  destination text NOT NULL,
  source text NOT NULL DEFAULT 'business-card'
);

GRANT SELECT ON public.card_scans TO authenticated;
GRANT ALL ON public.card_scans TO service_role;
ALTER TABLE public.card_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read card scans" ON public.card_scans;
CREATE POLICY "Owners read card scans" ON public.card_scans
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS card_scans_created_at_idx ON public.card_scans (created_at DESC);

CREATE OR REPLACE FUNCTION public.record_card_scan(_destination text, _source text DEFAULT 'business-card')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.card_scans (destination, source)
  VALUES (left(coalesce(_destination, ''), 500), left(coalesce(_source, 'business-card'), 60));
END;
$$;

REVOKE ALL ON FUNCTION public.record_card_scan(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_card_scan(text, text) TO service_role;
