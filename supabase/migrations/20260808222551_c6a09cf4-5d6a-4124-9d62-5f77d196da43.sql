ALTER TABLE public.ecards
  ADD COLUMN IF NOT EXISTS reminder_early_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS organizer_timezone text;