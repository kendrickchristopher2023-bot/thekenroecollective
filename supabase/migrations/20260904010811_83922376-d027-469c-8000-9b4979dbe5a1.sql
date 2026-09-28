ALTER TABLE public.sound_piece_purchases
  ADD COLUMN IF NOT EXISTS render_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_id text,
  ADD COLUMN IF NOT EXISTS refund_reason text;

ALTER TABLE public.sound_pieces
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by uuid,
  ADD COLUMN IF NOT EXISTS removed_reason text;

CREATE OR REPLACE FUNCTION public.get_sound_piece_by_token(_token text)
RETURNS TABLE(id uuid, kind text, title text, seconds integer, storage_path text, licence text, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.kind, p.title, p.seconds, p.storage_path, p.licence, p.created_at
  FROM public.sound_pieces p
  WHERE p.share_token = _token
    AND p.removed_at IS NULL
  LIMIT 1;
$function$;

CREATE TABLE IF NOT EXISTS public.sound_safety_refusals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stage text NOT NULL,
  categories text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sound_safety_refusals TO authenticated;
GRANT ALL ON public.sound_safety_refusals TO service_role;
ALTER TABLE public.sound_safety_refusals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins read music safety refusals" ON public.sound_safety_refusals;
CREATE POLICY "Owners and admins read music safety refusals"
ON public.sound_safety_refusals FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));