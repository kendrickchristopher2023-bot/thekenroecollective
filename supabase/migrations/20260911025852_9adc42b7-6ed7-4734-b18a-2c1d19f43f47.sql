CREATE TABLE public.thank_you_links (
  token text PRIMARY KEY,
  event_id text NOT NULL,
  card_id text NOT NULL,
  guest_id text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  UNIQUE (event_id, card_id, guest_id)
);
CREATE INDEX thank_you_links_event_idx ON public.thank_you_links (event_id, card_id);
GRANT ALL ON public.thank_you_links TO service_role;
ALTER TABLE public.thank_you_links ENABLE ROW LEVEL SECURITY;