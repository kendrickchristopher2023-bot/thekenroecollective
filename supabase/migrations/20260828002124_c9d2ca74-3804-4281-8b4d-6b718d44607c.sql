CREATE TABLE public.event_reminder_sends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL,
  guest_id TEXT NOT NULL,
  preset_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT event_reminder_sends_unique UNIQUE (event_id, guest_id, preset_id, channel)
);

GRANT ALL ON public.event_reminder_sends TO service_role;

ALTER TABLE public.event_reminder_sends ENABLE ROW LEVEL SECURITY;

CREATE INDEX event_reminder_sends_event_idx ON public.event_reminder_sends (event_id, sent_at DESC);
