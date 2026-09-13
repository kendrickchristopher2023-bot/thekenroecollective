CREATE TABLE public.event_wall_music (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  title text NOT NULL,
  duration_seconds integer,
  byte_size integer,
  uploaded_by uuid NOT NULL,
  licence_affirmed_at timestamptz NOT NULL DEFAULT now(),
  licence_affirmation_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_wall_music_event_idx ON public.event_wall_music (event_id, created_at);

GRANT SELECT ON public.event_wall_music TO anon;
GRANT SELECT, DELETE ON public.event_wall_music TO authenticated;
GRANT ALL ON public.event_wall_music TO service_role;

ALTER TABLE public.event_wall_music ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone with the link can play event wall music"
  ON public.event_wall_music FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Hosts can remove their event wall music"
  ON public.event_wall_music FOR DELETE TO authenticated
  USING (public.can_edit_event(event_id, auth.uid()));

CREATE TRIGGER event_wall_music_touch_updated_at
  BEFORE UPDATE ON public.event_wall_music
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();