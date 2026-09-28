
-- Media uploads library
CREATE TABLE public.media_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bucket text NOT NULL DEFAULT 'atelier-media',
  object_path text NOT NULL,
  public_url text NOT NULL,
  original_filename text,
  content_type text,
  size_bytes integer,
  width integer,
  height integer,
  source text NOT NULL DEFAULT 'converter',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_uploads TO authenticated;
GRANT ALL ON public.media_uploads TO service_role;

ALTER TABLE public.media_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read all uploads"
  ON public.media_uploads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR user_id = auth.uid());

CREATE POLICY "Users can insert their own uploads"
  ON public.media_uploads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own uploads"
  ON public.media_uploads FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own uploads"
  ON public.media_uploads FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE INDEX idx_media_uploads_user_created ON public.media_uploads(user_id, created_at DESC);

-- Hero image column for announcements
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS image_url text;
