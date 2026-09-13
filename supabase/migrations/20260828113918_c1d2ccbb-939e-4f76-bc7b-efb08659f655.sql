-- Share links must not carry the owner's account id or the share token itself.
CREATE OR REPLACE FUNCTION public.get_shared_design(p_token text)
RETURNS SETOF public.design_assets
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.id, NULL::uuid AS user_id, NULL::text AS event_id, d.kind, d.template_id,
         d.title, d.content, d.thumbnail_url, NULL::text AS share_token,
         NULL::text AS environment, d.created_at, d.updated_at
  FROM public.design_assets d
  WHERE d.share_token IS NOT NULL
    AND d.share_token = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_ai_package(p_token text)
RETURNS SETOF public.ai_packages
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.id, NULL::uuid AS user_id, NULL::text AS event_id, NULL::uuid AS project_id,
         a.kind, a.title, a.prompt, a.guest_count, a.budget_cents, a.content, a.model,
         a.created_at, a.updated_at, a.attachments, NULL::text AS share_token
  FROM public.ai_packages a
  WHERE a.share_token IS NOT NULL
    AND a.share_token = p_token
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_shared_design(text) IS 'Public share-link read. Owner user_id, event_id, environment and share_token are deliberately NULL: share links are forwardable.';
COMMENT ON FUNCTION public.get_shared_ai_package(text) IS 'Public share-link read. Owner user_id, event_id, project_id and share_token are deliberately NULL: share links are forwardable.';