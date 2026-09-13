-- 1. Remove SECURITY DEFINER (definer-semantics) views: use invoker semantics
--    plus narrow column grants and public read policies on the base tables.
ALTER VIEW public.vendors_public SET (security_invoker = on);
ALTER VIEW public.vendor_reviews_public SET (security_invoker = on);

GRANT SELECT (id, slug, name, category, city, region, country, bio, website,
              hero_image, gallery, price_range, status, verified_at, created_at, updated_at)
  ON public.vendors TO anon;
GRANT SELECT (id, vendor_id, rating, body, created_at)
  ON public.vendor_reviews TO anon;

DROP POLICY IF EXISTS "Public can view verified vendors" ON public.vendors;
CREATE POLICY "Public can view verified vendors"
  ON public.vendors FOR SELECT TO anon
  USING (status = 'verified');

DROP POLICY IF EXISTS "Public can view reviews of verified vendors" ON public.vendor_reviews;
CREATE POLICY "Public can view reviews of verified vendors"
  ON public.vendor_reviews FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_reviews.vendor_id AND v.status = 'verified'));

DROP POLICY IF EXISTS "Signed-in can view reviews of verified vendors" ON public.vendor_reviews;
CREATE POLICY "Signed-in can view reviews of verified vendors"
  ON public.vendor_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_reviews.vendor_id AND v.status = 'verified'));

-- 2. Lock entitlement columns on profiles against self-service escalation.
--    SECURITY INVOKER on purpose: current_user reflects the real caller, so
--    trusted SECURITY DEFINER functions (trials, deletion requests) still pass.
CREATE OR REPLACE FUNCTION public.profiles_block_entitlement_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.guest_import_enabled IS DISTINCT FROM OLD.guest_import_enabled
     OR NEW.thank_you_cards_enabled IS DISTINCT FROM OLD.thank_you_cards_enabled
     OR NEW.sms_pack_enabled IS DISTINCT FROM OLD.sms_pack_enabled
     OR NEW.converter_enabled IS DISTINCT FROM OLD.converter_enabled
     OR NEW.atelier_trial_used IS DISTINCT FROM OLD.atelier_trial_used
     OR NEW.atelier_trial_started_at IS DISTINCT FROM OLD.atelier_trial_started_at
     OR NEW.atelier_trial_expires_at IS DISTINCT FROM OLD.atelier_trial_expires_at
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Plan, trial, and feature access can only be changed by server-side billing code.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.profiles_block_entitlement_self_update() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS profiles_block_entitlement_self_update ON public.profiles;
CREATE TRIGGER profiles_block_entitlement_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_block_entitlement_self_update();

-- 3. one_time_passes: users no longer update pass rows directly. Attaching a
--    pass to an event goes through a vetted definer function instead.
DROP POLICY IF EXISTS "Users attach own passes" ON public.one_time_passes;
REVOKE UPDATE ON public.one_time_passes FROM authenticated;

CREATE OR REPLACE FUNCTION public.attach_pass_to_event(_pass_id uuid, _event_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _pass public.one_time_passes%ROWTYPE;
  _event_data jsonb;
  _raw_date text;
  _parsed timestamptz;
  _expires timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Sign in to attach this pass.');
  END IF;

  IF public.get_event_owner_id(_event_id) IS DISTINCT FROM _uid THEN
    RETURN jsonb_build_object('error', 'Event not found');
  END IF;

  SELECT * INTO _pass FROM public.one_time_passes
   WHERE id = _pass_id AND user_id = _uid
     AND revoked_at IS NULL AND refunded_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Pass not found');
  END IF;

  IF _pass.event_id IS NOT NULL AND _pass.event_id <> _event_id THEN
    RETURN jsonb_build_object('error', 'This pass is already attached to a different event.');
  END IF;

  _expires := _pass.purchased_at + interval '365 days';

  SELECT data INTO _event_data FROM public.events WHERE id = _event_id;
  _raw_date := coalesce(_event_data->>'date', _event_data->>'eventDate');
  IF _raw_date IS NOT NULL THEN
    BEGIN
      _parsed := _raw_date::timestamptz;
      IF _parsed + interval '90 days' < _expires THEN
        _expires := _parsed + interval '90 days';
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  UPDATE public.one_time_passes
     SET event_id = _event_id,
         attached_at = now(),
         expires_at = _expires
   WHERE id = _pass_id AND user_id = _uid;

  RETURN jsonb_build_object('ok', true, 'expiresAt', _expires);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_pass_to_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_pass_to_event(uuid, text) TO authenticated, service_role;