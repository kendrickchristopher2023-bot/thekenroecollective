CREATE TABLE public.data_cleanup_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text,
  guests_anonymized integer NOT NULL DEFAULT 0,
  cleanup_type text NOT NULL CHECK (cleanup_type IN ('auto_expire','deletion_request')),
  executed_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
GRANT ALL ON public.data_cleanup_log TO service_role;
ALTER TABLE public.data_cleanup_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX data_cleanup_log_executed_at_idx ON public.data_cleanup_log (executed_at DESC);
CREATE INDEX data_cleanup_log_event_id_idx ON public.data_cleanup_log (event_id);