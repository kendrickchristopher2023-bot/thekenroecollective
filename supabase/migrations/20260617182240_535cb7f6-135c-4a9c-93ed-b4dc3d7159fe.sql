
CREATE TABLE public.events (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  branded_slug TEXT UNIQUE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Public can read events (invite, gift, check-in pages are shared via link)
CREATE POLICY "Events are publicly readable"
  ON public.events FOR SELECT
  USING (true);

-- Owners can insert their own events; unowned inserts also allowed so first-save can claim
CREATE POLICY "Authenticated users insert their own events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Owners update their own events; allow updating an unowned row to claim it
CREATE POLICY "Owners update their events"
  ON public.events FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners delete their events"
  ON public.events FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER events_touch_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX events_user_id_idx ON public.events(user_id);
CREATE INDEX events_branded_slug_idx ON public.events(branded_slug);
