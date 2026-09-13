
CREATE OR REPLACE FUNCTION public.mark_pass_material_use_by_event(_event_id text, _reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.one_time_passes
    SET first_material_use_at = now(),
        refund_reason = COALESCE(refund_reason, _reason)
  WHERE event_id = _event_id
    AND first_material_use_at IS NULL
    AND revoked_at IS NULL;
END;
$function$;

-- Only service_role should invoke this variant (no user auth).
REVOKE ALL ON FUNCTION public.mark_pass_material_use_by_event(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_pass_material_use_by_event(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pass_material_use_by_event(text, text) TO service_role;
