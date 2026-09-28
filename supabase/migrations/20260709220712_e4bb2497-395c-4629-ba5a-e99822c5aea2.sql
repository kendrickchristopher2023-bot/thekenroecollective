-- 1. contact_broadcasts
CREATE TABLE public.contact_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  subject text NOT NULL,
  body_preview text,
  recipient_count int NOT NULL DEFAULT 0,
  queued_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  filter_tag text,
  filter_group_id uuid,
  cta_url text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_broadcasts_owner_idx ON public.contact_broadcasts(owner_user_id, sent_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_broadcasts TO authenticated;
GRANT ALL ON public.contact_broadcasts TO service_role;
ALTER TABLE public.contact_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage own broadcasts"
  ON public.contact_broadcasts FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- 2. contact_broadcast_recipients
CREATE TABLE public.contact_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.contact_broadcasts(id) ON DELETE CASCADE,
  contact_id uuid,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_broadcast_recipients_bcast_idx ON public.contact_broadcast_recipients(broadcast_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_broadcast_recipients TO authenticated;
GRANT ALL ON public.contact_broadcast_recipients TO service_role;
ALTER TABLE public.contact_broadcast_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners see own broadcast recipients"
  ON public.contact_broadcast_recipients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_broadcasts b
      WHERE b.id = contact_broadcast_recipients.broadcast_id
        AND b.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contact_broadcasts b
      WHERE b.id = contact_broadcast_recipients.broadcast_id
        AND b.owner_user_id = auth.uid()
    )
  );

-- 3. Extend owner_contacts_snapshot with growth + source conversion
CREATE OR REPLACE FUNCTION public.owner_contacts_snapshot(_since timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN jsonb_build_object(
    'contacts_total', (SELECT count(*)::int FROM public.contacts),
    'contacts_new', (SELECT count(*)::int FROM public.contacts WHERE created_at >= _since),
    'contacts_opted_out', (SELECT count(*)::int FROM public.contacts WHERE email_opt_out = true),
    'contacts_by_source', (
      SELECT COALESCE(jsonb_object_agg(source, cnt), '{}'::jsonb) FROM (
        SELECT source, count(*)::int AS cnt FROM public.contacts GROUP BY source
      ) s
    ),
    'contacts_by_day', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) FROM (
        SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS count
        FROM public.contacts
        WHERE created_at >= (now() - interval '90 days')
        GROUP BY 1
      ) t
    ),
    'rsvp_conversion_by_source', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.source), '[]'::jsonb) FROM (
        SELECT c.source,
               count(*)::int AS total,
               count(DISTINCT l.contact_id)::int AS with_rsvp
        FROM public.contacts c
        LEFT JOIN public.contact_event_links l
          ON l.contact_id = c.id AND l.rsvp_status IS NOT NULL
        GROUP BY c.source
      ) t
    ),
    'top_tags', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.cnt DESC), '[]'::jsonb) FROM (
        SELECT tag, count(*)::int AS cnt
        FROM public.contacts, unnest(tags) AS tag
        GROUP BY tag ORDER BY count(*) DESC LIMIT 10
      ) t
    ),
    'top_owners', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.contacts DESC), '[]'::jsonb) FROM (
        SELECT owner_user_id, count(*)::int AS contacts
        FROM public.contacts GROUP BY owner_user_id
        ORDER BY count(*) DESC LIMIT 10
      ) t
    ),
    'broadcasts_sent', (SELECT count(*)::int FROM public.contact_broadcasts WHERE sent_at >= _since),
    'broadcast_recipients', (SELECT COALESCE(sum(recipient_count),0)::int FROM public.contact_broadcasts WHERE sent_at >= _since),
    'event_links', (SELECT count(*)::int FROM public.contact_event_links)
  );
END;
$function$;