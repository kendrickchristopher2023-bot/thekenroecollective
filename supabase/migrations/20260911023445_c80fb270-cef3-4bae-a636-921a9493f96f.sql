-- 1. Identity-based demo recognition ---------------------------------------
CREATE OR REPLACE FUNCTION public.is_demo_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _user_id
      AND (
        lower(coalesce(u.email, '')) IN ('demo@thekenroecollective.com', 'showcase-system@thekenroecollective.com')
        OR coalesce(u.raw_app_meta_data->>'system_account', '') = 'showcase'
        OR coalesce((u.raw_user_meta_data->>'is_demo')::boolean, false)
      )
  );
$$;
REVOKE ALL ON FUNCTION public.is_demo_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_demo_user(uuid) TO authenticated, service_role;

-- 2. Anything a demo account saves is demo data ----------------------------
CREATE OR REPLACE FUNCTION public.events_flag_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND public.is_demo_user(NEW.user_id) THEN
    NEW.is_demo := true;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS events_flag_demo_trg ON public.events;
CREATE TRIGGER events_flag_demo_trg
  BEFORE INSERT OR UPDATE OF user_id, is_demo ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_flag_demo();

-- 3. No collaborators on the showcase or any demo event --------------------
CREATE OR REPLACE FUNCTION public.block_demo_event_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  demo_event boolean := false;
BEGIN
  IF public.is_showcase_event(NEW.event_id) THEN
    RAISE EXCEPTION 'This is a sample invitation and cannot have collaborators.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce(e.is_demo, false) INTO demo_event FROM public.events e WHERE e.id = NEW.event_id;
  IF coalesce(demo_event, false) THEN
    RAISE EXCEPTION 'Demo events cannot have collaborators.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_demo_event_members() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS block_demo_event_members_trg ON public.event_members;
CREATE TRIGGER block_demo_event_members_trg
  BEFORE INSERT OR UPDATE ON public.event_members
  FOR EACH ROW EXECUTE FUNCTION public.block_demo_event_members();
DELETE FROM public.event_members WHERE public.is_showcase_event(event_id);

-- 4. Showcase owner transfer, service-only ----------------------------------
CREATE OR REPLACE FUNCTION public.block_showcase_event_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_showcase_event(OLD.id)
     AND coalesce(current_setting('app.showcase_seed', true), '') <> 'on' THEN
    RAISE EXCEPTION 'This is a sample invitation and is read-only.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.adopt_showcase_event(_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.showcase_seed', 'on', true);
  UPDATE public.events SET user_id = _owner, is_demo = true WHERE public.is_showcase_event(id);
  PERFORM set_config('app.showcase_seed', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.adopt_showcase_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adopt_showcase_event(uuid) TO service_role;

-- 5. Public lookups say when an invitation is demo data --------------------
CREATE OR REPLACE FUNCTION public.get_public_event_by_id(_id text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN e.archived_at IS NOT NULL THEN NULL
    WHEN e.data IS NULL THEN NULL
    ELSE (e.data::jsonb || jsonb_build_object('shareToken', e.share_token, 'isDemoInvitation', coalesce(e.is_demo, false)))
  END
  FROM public.events e
  WHERE e.id = _id
  LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.get_public_event_by_slug(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN e.archived_at IS NOT NULL THEN NULL
    WHEN e.data IS NULL THEN NULL
    ELSE (e.data::jsonb || jsonb_build_object('shareToken', e.share_token, 'isDemoInvitation', coalesce(e.is_demo, false)))
  END
  FROM public.events e
  WHERE lower(e.branded_slug) = lower(_slug)
  LIMIT 1;
$$;

-- 6. Blocked-attempt ledger for the daily owner alert ----------------------
CREATE TABLE IF NOT EXISTS public.demo_guard_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  actor_user_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.demo_guard_log TO service_role;
ALTER TABLE public.demo_guard_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS demo_guard_log_created_idx ON public.demo_guard_log (created_at DESC);

-- 7. Seeded state of the curated demo events --------------------------------
CREATE TABLE IF NOT EXISTS public.demo_event_snapshots (
  event_id text PRIMARY KEY,
  row jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.demo_event_snapshots TO service_role;
ALTER TABLE public.demo_event_snapshots ENABLE ROW LEVEL SECURITY;
INSERT INTO public.demo_event_snapshots (event_id, row)
SELECT e.id, jsonb_build_object(
  'id', e.id, 'user_id', e.user_id, 'branded_slug', e.branded_slug, 'data', e.data,
  'language', e.language, 'share_token', e.share_token, 'honoree_email', e.honoree_email, 'is_demo', true)
FROM public.events e
WHERE e.id IN ('demo-reunion-200', 'demo-evt-supper')
ON CONFLICT (event_id) DO NOTHING;

-- 8. Showcase interaction counter: who, and which step ----------------------
ALTER TABLE public.showcase_interactions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.showcase_interactions DROP CONSTRAINT IF EXISTS showcase_interactions_kind_check;
ALTER TABLE public.showcase_interactions
  ADD CONSTRAINT showcase_interactions_kind_check
  CHECK (kind IN ('open', 'play', 'cta', 'example_invite', 'example_host_view', 'example_create'));
CREATE INDEX IF NOT EXISTS showcase_interactions_user_kind_idx ON public.showcase_interactions (user_id, kind);

-- 9. Daily demo-guard digest ------------------------------------------------
SELECT cron.unschedule('demo-guard-digest-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo-guard-digest-daily');
SELECT cron.schedule('demo-guard-digest-daily', '35 11 * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/demo-guard-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);