-- Enums
DO $$ BEGIN
  CREATE TYPE public.announcement_type AS ENUM ('venue_change','cancellation','date_change','general');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.announcement_status AS ENUM ('draft','scheduled','sent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.announcement_audience AS ENUM ('all_users','event');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Announcements table
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.announcement_type NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text NOT NULL,
  link_url text,
  link_label text,
  audience public.announcement_audience NOT NULL DEFAULT 'all_users',
  event_id text,
  event_title text,
  channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  status public.announcement_status NOT NULL DEFAULT 'draft',
  scheduled_for timestamptz,
  sent_at timestamptz,
  email_subject text,
  email_body text,
  sms_text text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.announcements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads sent announcements"
ON public.announcements FOR SELECT
USING (status = 'sent');

CREATE POLICY "Admins read all announcements"
ON public.announcements FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert announcements"
ON public.announcements FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update announcements"
ON public.announcements FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete announcements"
ON public.announcements FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Dismissals table
CREATE TABLE public.announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.announcement_dismissals TO authenticated;
GRANT ALL ON public.announcement_dismissals TO service_role;

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own dismissals"
ON public.announcement_dismissals FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "User inserts own dismissal"
ON public.announcement_dismissals FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User deletes own dismissal"
ON public.announcement_dismissals FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Phone + SMS opt-in on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false;

-- Allow users to update their own profile (needed for phone/sms_opt_in editing)
DO $$ BEGIN
  CREATE POLICY "own profile update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER announcements_touch
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Index for active banner lookups
CREATE INDEX IF NOT EXISTS announcements_status_sent_at_idx
  ON public.announcements (status, sent_at DESC);