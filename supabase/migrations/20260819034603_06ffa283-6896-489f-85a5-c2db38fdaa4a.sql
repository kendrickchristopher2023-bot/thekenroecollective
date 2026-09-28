-- 1. Additive demo markers (no drops, defaults keep every existing row unchanged)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.is_demo IS 'True only for rows created by the demo seeder (demo host account). Never set on real customer events.';
COMMENT ON COLUMN public.vendors.is_demo IS 'True only for rows created by the demo seeder (demo host account). Never set on real vendor profiles.';

-- 2. Narrow backfill: only the seeded demo rows owned by the demo host account
UPDATE public.events
   SET is_demo = true
 WHERE user_id = '7d036969-831d-4dd8-a219-1c493d7aacb4'::uuid
   AND id LIKE 'demo-%'
   AND is_demo = false;

UPDATE public.vendors
   SET is_demo = true
 WHERE owner_user_id = '7d036969-831d-4dd8-a219-1c493d7aacb4'::uuid
   AND slug LIKE 'demo-%'
   AND is_demo = false;

-- 3. Tombstones so deleted demo rows are not resurrected by the nightly reseed
CREATE TABLE IF NOT EXISTS public.demo_seed_tombstones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('event', 'vendor')),
  row_key text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, row_key)
);

GRANT ALL ON public.demo_seed_tombstones TO service_role;
GRANT SELECT ON public.demo_seed_tombstones TO authenticated;

ALTER TABLE public.demo_seed_tombstones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins read demo tombstones"
  ON public.demo_seed_tombstones FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

COMMENT ON TABLE public.demo_seed_tombstones IS 'Records demo-only rows that were deleted, so the nightly demo reseed skips them. Written by triggers that fire only when is_demo = true.';

-- 4. Tombstone triggers: fire ONLY for demo-flagged rows
CREATE OR REPLACE FUNCTION public.record_demo_event_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.is_demo, false) THEN
    INSERT INTO public.demo_seed_tombstones (kind, row_key)
    VALUES ('event', OLD.id)
    ON CONFLICT (kind, row_key) DO UPDATE SET deleted_at = now();
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_demo_vendor_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.is_demo, false) AND OLD.slug IS NOT NULL THEN
    INSERT INTO public.demo_seed_tombstones (kind, row_key)
    VALUES ('vendor', OLD.slug)
    ON CONFLICT (kind, row_key) DO UPDATE SET deleted_at = now();
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_demo_event_tombstone ON public.events;
CREATE TRIGGER trg_demo_event_tombstone
  AFTER DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.record_demo_event_tombstone();

DROP TRIGGER IF EXISTS trg_demo_vendor_tombstone ON public.vendors;
CREATE TRIGGER trg_demo_vendor_tombstone
  AFTER DELETE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.record_demo_vendor_tombstone();

-- 5. Demo vendors must not alert the real owner
CREATE OR REPLACE FUNCTION public.notify_new_vendor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_demo, false) OR COALESCE(NEW.slug, '') LIKE 'demo-%' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_notifications (kind, title, body, link, metadata)
  VALUES (
    'vendor_created',
    'New vendor profile: ' || COALESCE(NEW.name, 'Unnamed'),
    COALESCE(NEW.category, '') || ' • ' || COALESCE(NEW.city, ''),
    '/vendors/' || COALESCE(NEW.slug, NEW.id::text),
    jsonb_build_object('vendor_id', NEW.id, 'owner_user_id', NEW.owner_user_id)
  );
  RETURN NEW;
END;
$$;