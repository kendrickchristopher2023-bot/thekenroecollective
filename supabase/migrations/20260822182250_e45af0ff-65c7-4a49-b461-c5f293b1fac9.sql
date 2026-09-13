ALTER TABLE public.event_guest_requests
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;

CREATE TABLE public.host_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id TEXT REFERENCES public.events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.host_notifications TO authenticated;
GRANT ALL ON public.host_notifications TO service_role;

ALTER TABLE public.host_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients can read their host notifications"
  ON public.host_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Recipients can update their host notifications"
  ON public.host_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Recipients can delete their host notifications"
  ON public.host_notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX host_notifications_user_created_idx
  ON public.host_notifications (user_id, created_at DESC);

CREATE TRIGGER update_host_notifications_updated_at
  BEFORE UPDATE ON public.host_notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();