-- ============ 1. Internal (owner-only) technical changelog ============
CREATE TABLE public.dev_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_sha text,
  published_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  body_md text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'fix',
  severity text NOT NULL DEFAULT 'normal',
  files text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_changelog TO authenticated;
GRANT ALL ON public.dev_changelog TO service_role;

ALTER TABLE public.dev_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read dev changelog"
  ON public.dev_changelog FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owners write dev changelog"
  ON public.dev_changelog FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owners update dev changelog"
  ON public.dev_changelog FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owners delete dev changelog"
  ON public.dev_changelog FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER dev_changelog_touch_updated_at
  BEFORE UPDATE ON public.dev_changelog
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX dev_changelog_published_idx ON public.dev_changelog (published_at DESC);

-- ============ 2. Invitation comments ============
CREATE TABLE public.event_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.event_comments(id) ON DELETE CASCADE,
  guest_id text,
  guest_name text,
  author_role text NOT NULL DEFAULT 'guest',
  body text NOT NULL,
  visibility text NOT NULL DEFAULT 'private',
  hidden boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  host_read_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_comments_visibility_chk CHECK (visibility IN ('private', 'public')),
  CONSTRAINT event_comments_author_chk CHECK (author_role IN ('guest', 'host'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_comments TO authenticated;
GRANT ALL ON public.event_comments TO service_role;

ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers read their event comments"
  ON public.event_comments FOR SELECT TO authenticated
  USING (public.can_edit_event(event_id, auth.uid())
         OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers reply on their event comments"
  ON public.event_comments FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_event(event_id, auth.uid())
         OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers moderate their event comments"
  ON public.event_comments FOR UPDATE TO authenticated
  USING (public.can_edit_event(event_id, auth.uid())
         OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.can_edit_event(event_id, auth.uid())
         OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers delete their event comments"
  ON public.event_comments FOR DELETE TO authenticated
  USING (public.can_edit_event(event_id, auth.uid())
         OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER event_comments_touch_updated_at
  BEFORE UPDATE ON public.event_comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX event_comments_event_idx ON public.event_comments (event_id, created_at DESC);
CREATE INDEX event_comments_guest_idx ON public.event_comments (event_id, guest_id);

-- Guests have no session: posting and reading go through definer functions.
CREATE OR REPLACE FUNCTION public.post_event_comment(
  _event_id text,
  _guest_id text,
  _guest_name text,
  _body text,
  _visibility text,
  _flagged boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _data jsonb;
  _public_ok boolean;
  _recent int;
  _daily int;
  _vis text := CASE WHEN _visibility = 'public' THEN 'public' ELSE 'private' END;
  _row public.event_comments;
BEGIN
  IF _body IS NULL OR length(btrim(_body)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please write a comment first.');
  END IF;
  IF _guest_id IS NULL OR btrim(_guest_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Find your name on the guest list to comment.');
  END IF;

  SELECT e.data::jsonb INTO _data
  FROM public.events e
  WHERE e.id = _event_id AND e.archived_at IS NULL;

  IF _data IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Event not found.');
  END IF;

  -- The guest must exist on the host's guest list.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(_data->'guests', '[]'::jsonb)) g
    WHERE g->>'id' = _guest_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'We could not match you to the guest list.');
  END IF;

  _public_ok := coalesce((_data->>'publicCommentsEnabled')::boolean, false);
  IF _vis = 'public' AND NOT _public_ok THEN
    _vis := 'private';
  END IF;

  SELECT count(*) INTO _recent FROM public.event_comments c
  WHERE c.event_id = _event_id AND c.guest_id = _guest_id
    AND c.created_at > now() - interval '10 minutes';
  IF _recent >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have posted a few comments already. Please wait a few minutes.');
  END IF;

  SELECT count(*) INTO _daily FROM public.event_comments c
  WHERE c.event_id = _event_id AND c.guest_id = _guest_id
    AND c.created_at > now() - interval '1 day';
  IF _daily >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have reached the daily comment limit for this event.');
  END IF;

  -- Suppress an identical repost within the hour.
  IF EXISTS (
    SELECT 1 FROM public.event_comments c
    WHERE c.event_id = _event_id AND c.guest_id = _guest_id
      AND btrim(lower(c.body)) = btrim(lower(_body))
      AND c.created_at > now() - interval '1 hour'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You already posted that comment.');
  END IF;

  INSERT INTO public.event_comments (event_id, guest_id, guest_name, body, visibility, hidden, author_role)
  VALUES (
    _event_id,
    _guest_id,
    NULLIF(btrim(coalesce(_guest_name, '')), ''),
    left(btrim(_body), 1200),
    _vis,
    coalesce(_flagged, false) OR public.ecard_has_profanity(_body),
    'guest'
  )
  RETURNING * INTO _row;

  RETURN jsonb_build_object('ok', true, 'id', _row.id, 'visibility', _row.visibility,
                            'held', _row.hidden, 'createdAt', _row.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_event_comments_for_guest(_event_id text, _guest_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ev AS (
    SELECT e.id, coalesce((e.data::jsonb->>'publicCommentsEnabled')::boolean, false) AS public_ok
    FROM public.events e
    WHERE e.id = _event_id AND e.archived_at IS NULL
  ),
  visible AS (
    SELECT c.*
    FROM public.event_comments c
    JOIN ev ON ev.id = c.event_id
    WHERE c.hidden = false
      AND c.removed_at IS NULL
      AND (
        (c.visibility = 'public' AND ev.public_ok)
        OR (_guest_id IS NOT NULL AND _guest_id <> '' AND c.guest_id = _guest_id)
        OR (
          _guest_id IS NOT NULL AND _guest_id <> '' AND c.author_role = 'host'
          AND c.parent_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.event_comments p
            WHERE p.id = c.parent_id AND p.guest_id = _guest_id
          )
        )
      )
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'parentId', v.parent_id,
    'guestId', v.guest_id,
    'name', v.guest_name,
    'body', v.body,
    'visibility', v.visibility,
    'authorRole', v.author_role,
    'createdAt', v.created_at
  ) ORDER BY v.created_at ASC), '[]'::jsonb)
  FROM visible v;
$$;

GRANT EXECUTE ON FUNCTION public.post_event_comment(text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_comments_for_guest(text, text) TO anon, authenticated;