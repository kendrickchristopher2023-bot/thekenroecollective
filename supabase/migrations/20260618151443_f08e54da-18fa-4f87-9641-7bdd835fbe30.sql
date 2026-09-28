
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"product_updates":true,"event_reminders":true,"rfq_bids":true,"marketing":false}'::jsonb;

ALTER TABLE public.rfq_requests
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS awarded_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE public.rfq_requests ALTER COLUMN vendor_id DROP NOT NULL;

ALTER TABLE public.rfq_messages
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bid_amount numeric,
  ADD COLUMN IF NOT EXISTS is_bid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability_note text,
  ADD COLUMN IF NOT EXISTS bid_status text NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS public.yelp_cache (
  query_hash text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yelp_cache TO authenticated;
GRANT ALL ON public.yelp_cache TO service_role;
ALTER TABLE public.yelp_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='yelp_cache' AND policyname='auth read yelp cache') THEN
    CREATE POLICY "auth read yelp cache" ON public.yelp_cache FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.rfq_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfq_requests(id) ON DELETE CASCADE,
  yelp_business_id text,
  business_name text,
  email text,
  phone text,
  claim_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  claimed_at timestamptz,
  claimed_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq_invitations TO authenticated;
GRANT ALL ON public.rfq_invitations TO service_role;
ALTER TABLE public.rfq_invitations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rfq_invitations' AND policyname='requester reads own rfq invitations') THEN
    CREATE POLICY "requester reads own rfq invitations" ON public.rfq_invitations
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.rfq_requests r WHERE r.id = rfq_id AND r.requester_user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rfq_invitations' AND policyname='requester creates rfq invitations') THEN
    CREATE POLICY "requester creates rfq invitations" ON public.rfq_invitations
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM public.rfq_requests r WHERE r.id = rfq_id AND r.requester_user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rfq_messages' AND policyname='vendors bid on open rfqs') THEN
    CREATE POLICY "vendors bid on open rfqs" ON public.rfq_messages
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.rfq_requests r
          WHERE r.id = rfq_id
            AND (r.vendor_id IS NULL OR EXISTS (
              SELECT 1 FROM public.vendors v WHERE v.id = r.vendor_id AND v.owner_user_id = auth.uid()
            ))
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rfq_messages' AND policyname='requester reads own rfq messages') THEN
    CREATE POLICY "requester reads own rfq messages" ON public.rfq_messages
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.rfq_requests r WHERE r.id = rfq_id AND r.requester_user_id = auth.uid()))
      ;
  END IF;
END $$;
