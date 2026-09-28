CREATE TABLE public.event_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  uploader_label text,
  status text NOT NULL DEFAULT 'visible',
  ip_hash text,
  byte_size integer,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_photos_status_chk CHECK (status IN ('visible','hidden','removed'))
);

CREATE INDEX event_photos_event_idx ON public.event_photos (event_id, created_at DESC);

GRANT SELECT ON public.event_photos TO anon;
GRANT SELECT, UPDATE, DELETE ON public.event_photos TO authenticated;
GRANT ALL ON public.event_photos TO service_role;

ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view visible event photos"
  ON public.event_photos FOR SELECT TO anon, authenticated
  USING (status = 'visible');

CREATE POLICY "Hosts can view all photos for their events"
  ON public.event_photos FOR SELECT TO authenticated
  USING (public.can_edit_event(event_id, auth.uid()));

CREATE POLICY "Hosts can moderate photos for their events"
  ON public.event_photos FOR UPDATE TO authenticated
  USING (public.can_edit_event(event_id, auth.uid()))
  WITH CHECK (public.can_edit_event(event_id, auth.uid()));

CREATE POLICY "Hosts can delete photos for their events"
  ON public.event_photos FOR DELETE TO authenticated
  USING (public.can_edit_event(event_id, auth.uid()));

CREATE TRIGGER event_photos_touch_updated_at
  BEFORE UPDATE ON public.event_photos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.event_photo_rate_limit (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

GRANT ALL ON public.event_photo_rate_limit TO service_role;
ALTER TABLE public.event_photo_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_event_photo_rate_limit(_key text, _limit integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur record;
BEGIN
  SELECT * INTO cur FROM public.event_photo_rate_limit WHERE bucket_key = _key FOR UPDATE;
  IF cur IS NULL THEN
    INSERT INTO public.event_photo_rate_limit (bucket_key, window_start, count)
    VALUES (_key, now(), 1)
    ON CONFLICT (bucket_key) DO UPDATE SET count = public.event_photo_rate_limit.count + 1;
    RETURN true;
  END IF;
  IF cur.window_start < now() - make_interval(secs => _window_seconds) THEN
    UPDATE public.event_photo_rate_limit SET window_start = now(), count = 1 WHERE bucket_key = _key;
    RETURN true;
  END IF;
  IF cur.count >= _limit THEN
    RETURN false;
  END IF;
  UPDATE public.event_photo_rate_limit SET count = cur.count + 1 WHERE bucket_key = _key;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_event_photos(_event_id text)
RETURNS TABLE (id uuid, storage_path text, uploader_label text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.storage_path, p.uploader_label, p.created_at
  FROM public.event_photos p
  WHERE p.event_id = _event_id AND p.status = 'visible'
  ORDER BY p.created_at DESC
  LIMIT 300;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_event_photos(text) TO anon, authenticated;

CREATE POLICY "Public read of event photo files"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'event-photos');

CREATE POLICY "Hosts delete their event photo files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-photos'
    AND public.can_edit_event((storage.foldername(name))[1], auth.uid())
  );