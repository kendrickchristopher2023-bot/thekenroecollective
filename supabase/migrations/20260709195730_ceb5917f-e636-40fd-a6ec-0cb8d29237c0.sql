-- Contacts: email opt-out
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email_opt_out boolean NOT NULL DEFAULT false;

-- Devices: friendly label for management UI
ALTER TABLE public.user_known_devices ADD COLUMN IF NOT EXISTS label text;

-- Owner CRM analytics snapshot
CREATE OR REPLACE FUNCTION public.owner_contacts_snapshot(_since timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    'event_links', (SELECT count(*)::int FROM public.contact_event_links)
  );
END;
$$;