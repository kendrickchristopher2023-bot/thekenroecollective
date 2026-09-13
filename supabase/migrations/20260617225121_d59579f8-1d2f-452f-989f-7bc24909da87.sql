ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS events_archived_at_idx ON public.events (archived_at);