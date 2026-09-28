
-- =====================================================================
-- ad_placements: prevent vendors from self-approving or repricing ads
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ad_placements_restrict_vendor_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
BEGIN
  -- Service role bypass: no auth.uid(), trust the caller.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.has_role(auth.uid(), 'admin'::public.app_role) INTO _is_admin;
  IF _is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admin owner: freeze admin-only columns to their previous values.
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_price_id IS DISTINCT FROM OLD.stripe_price_id
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
  THEN
    RAISE EXCEPTION 'Only admins can change ad status, tier, review fields, ownership, or billing identifiers.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ad_placements_restrict_vendor_updates ON public.ad_placements;
CREATE TRIGGER ad_placements_restrict_vendor_updates
  BEFORE UPDATE ON public.ad_placements
  FOR EACH ROW
  EXECUTE FUNCTION public.ad_placements_restrict_vendor_updates();

-- =====================================================================
-- one_time_passes: users can only edit attach fields on their own passes
-- =====================================================================
CREATE OR REPLACE FUNCTION public.one_time_passes_restrict_user_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role bypass: no auth.uid(), trust the caller.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Owner (auth.uid() = user_id) may only change attach-related columns.
  -- All lifecycle/billing columns are frozen to their previous values.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
     OR NEW.refunded_at IS DISTINCT FROM OLD.refunded_at
     OR NEW.refund_reason IS DISTINCT FROM OLD.refund_reason
     OR NEW.ai_generations_cap IS DISTINCT FROM OLD.ai_generations_cap
     OR NEW.ai_generations_used IS DISTINCT FROM OLD.ai_generations_used
     OR NEW.first_material_use_at IS DISTINCT FROM OLD.first_material_use_at
     OR NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id
     OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.environment IS DISTINCT FROM OLD.environment
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only server-side code can change pass expiration, revocation, refund, tier, or AI usage.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS one_time_passes_restrict_user_updates ON public.one_time_passes;
CREATE TRIGGER one_time_passes_restrict_user_updates
  BEFORE UPDATE ON public.one_time_passes
  FOR EACH ROW
  EXECUTE FUNCTION public.one_time_passes_restrict_user_updates();
