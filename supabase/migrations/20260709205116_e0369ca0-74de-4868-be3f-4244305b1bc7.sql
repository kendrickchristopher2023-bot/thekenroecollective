
DO $$
DECLARE
  _evt RECORD;
  _guest JSONB;
  _name TEXT;
  _email TEXT;
  _phone TEXT;
  _contact_id UUID;
BEGIN
  FOR _evt IN
    SELECT e.id AS event_id, e.user_id AS owner, e.data
    FROM public.events e
    WHERE e.user_id IS NOT NULL
      AND e.archived_at IS NULL
      AND jsonb_typeof(e.data->'guests') = 'array'
      AND EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.user_id = e.user_id
          AND s.status IN ('active','trialing','past_due')
          AND (s.current_period_end IS NULL OR s.current_period_end > now())
          AND s.price_id ILIKE 'atelier%'
      )
  LOOP
    FOR _guest IN SELECT * FROM jsonb_array_elements(_evt.data->'guests')
    LOOP
      _name  := NULLIF(trim(COALESCE(_guest->>'name', _guest->>'displayName', _guest->>'display_name', '')), '');
      _email := NULLIF(lower(trim(COALESCE(_guest->>'email', ''))), '');
      _phone := NULLIF(regexp_replace(COALESCE(_guest->>'phone', ''), '[^0-9+]', '', 'g'), '');

      IF _name IS NULL AND _email IS NULL AND _phone IS NULL THEN
        CONTINUE;
      END IF;
      IF _name IS NULL THEN
        _name := COALESCE(_email, _phone, 'Guest');
      END IF;

      _contact_id := NULL;

      IF _email IS NOT NULL THEN
        SELECT id INTO _contact_id
        FROM public.contacts
        WHERE owner_user_id = _evt.owner AND lower(email) = _email
        LIMIT 1;
      END IF;

      IF _contact_id IS NULL AND _phone IS NOT NULL THEN
        SELECT id INTO _contact_id
        FROM public.contacts
        WHERE owner_user_id = _evt.owner AND phone = _phone
        LIMIT 1;
      END IF;

      IF _contact_id IS NULL THEN
        INSERT INTO public.contacts (owner_user_id, display_name, email, phone, tags, source)
        VALUES (
          _evt.owner, _name, _email, _phone,
          ARRAY['guest','event_backfill']::text[],
          'event_backfill'
        )
        RETURNING id INTO _contact_id;
      ELSE
        UPDATE public.contacts
        SET tags = (
          SELECT array_agg(DISTINCT t)
          FROM unnest(COALESCE(tags, ARRAY[]::text[]) || ARRAY['guest','event_backfill']) t
        )
        WHERE id = _contact_id;
      END IF;

      INSERT INTO public.contact_event_links (contact_id, event_id, owner_user_id)
      VALUES (_contact_id, _evt.event_id, _evt.owner)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
