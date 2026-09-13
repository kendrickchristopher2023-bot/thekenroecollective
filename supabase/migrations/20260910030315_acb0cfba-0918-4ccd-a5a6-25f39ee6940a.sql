CREATE OR REPLACE FUNCTION public.is_showcase_event(_event_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT lower(coalesce(_event_id, '')) = 'showcase-wedding' $$;

REVOKE ALL ON FUNCTION public.is_showcase_event(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_showcase_event(text) TO authenticated, anon, service_role;

-- Public-surface writes: refused for the showcase whatever path they arrive by,
-- including a crafted request straight to the RPCs with the anon key.
CREATE OR REPLACE FUNCTION public.block_showcase_public_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_showcase_event(COALESCE(NEW.event_id, OLD.event_id)) THEN
    RAISE EXCEPTION 'This is a sample invitation and is read-only.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER block_showcase_write_well_wishes
  BEFORE INSERT OR UPDATE ON public.event_well_wishes
  FOR EACH ROW EXECUTE FUNCTION public.block_showcase_public_write();

CREATE TRIGGER block_showcase_write_comments
  BEFORE INSERT OR UPDATE ON public.event_comments
  FOR EACH ROW EXECUTE FUNCTION public.block_showcase_public_write();

CREATE TRIGGER block_showcase_write_photos
  BEFORE INSERT OR UPDATE ON public.event_photos
  FOR EACH ROW EXECUTE FUNCTION public.block_showcase_public_write();

CREATE TRIGGER block_showcase_write_bring_items
  BEFORE INSERT OR UPDATE ON public.event_bring_items
  FOR EACH ROW EXECUTE FUNCTION public.block_showcase_public_write();

CREATE TRIGGER block_showcase_write_bring_claims
  BEFORE INSERT OR UPDATE ON public.event_bring_claims
  FOR EACH ROW EXECUTE FUNCTION public.block_showcase_public_write();

-- The event row itself: RSVP goes through public_update_guest, which rewrites
-- events.data. Blocking UPDATE means a viewer's RSVP can never persist. DELETE
-- and INSERT stay open so the nightly refresh can rebuild the sample.
CREATE OR REPLACE FUNCTION public.block_showcase_event_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_showcase_event(OLD.id) THEN
    RAISE EXCEPTION 'This is a sample invitation and is read-only.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER block_showcase_event_update
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.block_showcase_event_update();