UPDATE public.demo_event_snapshots s
SET row = s.row || jsonb_build_object(
  'well_wishes', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM public.event_well_wishes x WHERE x.event_id = s.event_id),
  'comments', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM public.event_comments x WHERE x.event_id = s.event_id),
  'photos', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM public.event_photos x WHERE x.event_id = s.event_id),
  'bring_items', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM public.event_bring_items x WHERE x.event_id = s.event_id),
  'bring_claims', (
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    FROM public.event_bring_claims x
    WHERE x.item_id IN (SELECT i.id FROM public.event_bring_items i WHERE i.event_id = s.event_id)
  )
)
WHERE s.event_id IN ('demo-reunion-200', 'demo-evt-supper')
  AND NOT (s.row ? 'well_wishes');

CREATE OR REPLACE FUNCTION public.restore_demo_event_snapshot(_event_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  snap jsonb;
  event_row jsonb;
BEGIN
  IF _event_id NOT IN ('demo-reunion-200', 'demo-evt-supper') THEN
    RAISE EXCEPTION 'Not a restorable curated demo event';
  END IF;
  SELECT row INTO snap FROM public.demo_event_snapshots WHERE event_id = _event_id;
  IF snap IS NULL THEN RAISE EXCEPTION 'Demo snapshot is missing'; END IF;
  event_row := snap - 'well_wishes' - 'comments' - 'photos' - 'bring_items' - 'bring_claims';

  DELETE FROM public.event_bring_claims
   WHERE item_id IN (SELECT id FROM public.event_bring_items WHERE event_id = _event_id);
  DELETE FROM public.event_bring_items WHERE event_id = _event_id;
  DELETE FROM public.event_well_wishes WHERE event_id = _event_id;
  DELETE FROM public.event_comments WHERE event_id = _event_id;
  DELETE FROM public.event_photos WHERE event_id = _event_id;
  DELETE FROM public.event_guest_requests WHERE event_id = _event_id;
  DELETE FROM public.event_members WHERE event_id = _event_id;
  DELETE FROM public.event_invite_opens WHERE event_id = _event_id;

  INSERT INTO public.events
  SELECT * FROM jsonb_populate_record(NULL::public.events, event_row)
  ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id, branded_slug = EXCLUDED.branded_slug,
    data = EXCLUDED.data, language = EXCLUDED.language,
    share_token = EXCLUDED.share_token, honoree_email = EXCLUDED.honoree_email,
    is_demo = true, archived_at = NULL, updated_at = now();

  INSERT INTO public.event_well_wishes SELECT * FROM jsonb_populate_recordset(NULL::public.event_well_wishes, coalesce(snap->'well_wishes', '[]'::jsonb));
  INSERT INTO public.event_comments SELECT * FROM jsonb_populate_recordset(NULL::public.event_comments, coalesce(snap->'comments', '[]'::jsonb));
  INSERT INTO public.event_photos SELECT * FROM jsonb_populate_recordset(NULL::public.event_photos, coalesce(snap->'photos', '[]'::jsonb));
  INSERT INTO public.event_bring_items SELECT * FROM jsonb_populate_recordset(NULL::public.event_bring_items, coalesce(snap->'bring_items', '[]'::jsonb));
  INSERT INTO public.event_bring_claims SELECT * FROM jsonb_populate_recordset(NULL::public.event_bring_claims, coalesce(snap->'bring_claims', '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.restore_demo_event_snapshot(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_demo_event_snapshot(text) TO service_role;

SELECT cron.unschedule('demo-reset-nightly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo-reset-nightly');
SELECT cron.schedule('demo-reset-nightly', '30 4 * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/demo-reset',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
$cron$);