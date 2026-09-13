CREATE TABLE public.ventures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tagline text NOT NULL,
  href text NOT NULL,
  cta_label text NOT NULL,
  is_external boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'live',
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  accent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ventures TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventures TO authenticated;
GRANT ALL ON public.ventures TO service_role;

ALTER TABLE public.ventures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view visible ventures"
  ON public.ventures FOR SELECT
  TO anon, authenticated
  USING (visible = true);

CREATE POLICY "Owners can manage ventures"
  ON public.ventures FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER ventures_touch_updated_at
  BEFORE UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.ventures (name, tagline, href, cta_label, is_external, status, sort_order, accent) VALUES
  ('Events & Gatherings', 'Invitations, RSVPs, vendors, and the whole evening — orchestrated with editorial care.', '/gatherings', 'Enter the atelier', false, 'live', 10, 'velvet'),
  ('AI Resume Wizard', 'An AI job-search companion for résumés, letters, and applications that land.', 'https://excel-ai-resume.lovable.app/request-access', 'Request early access', true, 'invite_only', 20, 'gold');
