CREATE TABLE public.product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nps integer NOT NULL CHECK (nps >= 0 AND nps <= 10),
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  allow_public boolean NOT NULL DEFAULT false,
  public_name text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_feedback_created_at_idx ON public.product_feedback (created_at DESC);
CREATE INDEX product_feedback_user_idx ON public.product_feedback (user_id);

GRANT SELECT, INSERT ON public.product_feedback TO authenticated;
GRANT UPDATE (approved, updated_at) ON public.product_feedback TO authenticated;
GRANT ALL ON public.product_feedback TO service_role;

ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own feedback insert" ON public.product_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own feedback read" ON public.product_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "owner reads all feedback" ON public.product_feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "owner moderates feedback" ON public.product_feedback
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER product_feedback_touch
  BEFORE UPDATE ON public.product_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.product_feedback_prompt (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snooze_until timestamptz,
  dismissed_forever boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.product_feedback_prompt TO authenticated;
GRANT ALL ON public.product_feedback_prompt TO service_role;

ALTER TABLE public.product_feedback_prompt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own prompt state read" ON public.product_feedback_prompt
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own prompt state insert" ON public.product_feedback_prompt
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own prompt state update" ON public.product_feedback_prompt
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER product_feedback_prompt_touch
  BEFORE UPDATE ON public.product_feedback_prompt
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_public_testimonials(_limit integer DEFAULT 12)
RETURNS TABLE(public_name text, rating integer, comment text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(btrim(f.public_name), ''), 'A Kenroe customer') AS public_name,
    f.rating,
    f.comment,
    f.created_at
  FROM public.product_feedback f
  WHERE f.allow_public = true
    AND f.approved = true
    AND f.comment IS NOT NULL
    AND btrim(f.comment) <> ''
  ORDER BY f.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 50))
$$;

GRANT EXECUTE ON FUNCTION public.get_public_testimonials(integer) TO anon, authenticated;