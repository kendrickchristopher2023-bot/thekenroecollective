CREATE OR REPLACE FUNCTION public.profile_entitlements_unchanged(_id uuid, _tier text, _atelier_trial_used boolean, _atelier_trial_expires_at timestamptz, _guest_import_enabled boolean, _thank_you_cards_enabled boolean, _converter_enabled boolean, _sms_pack_enabled boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _id
      AND p.tier IS NOT DISTINCT FROM _tier
      AND p.atelier_trial_used IS NOT DISTINCT FROM _atelier_trial_used
      AND p.atelier_trial_expires_at IS NOT DISTINCT FROM _atelier_trial_expires_at
      AND p.guest_import_enabled IS NOT DISTINCT FROM _guest_import_enabled
      AND p.thank_you_cards_enabled IS NOT DISTINCT FROM _thank_you_cards_enabled
      AND p.converter_enabled IS NOT DISTINCT FROM _converter_enabled
      AND p.sms_pack_enabled IS NOT DISTINCT FROM _sms_pack_enabled
  )
$$;

DROP POLICY IF EXISTS "own profile update" ON public.profiles;

CREATE POLICY "own profile update" ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND public.profile_entitlements_unchanged(
    id, tier, atelier_trial_used, atelier_trial_expires_at,
    guest_import_enabled, thank_you_cards_enabled, converter_enabled, sms_pack_enabled
  )
);