-- Anonymous visitors must never touch the potluck base tables directly; they
-- go through get_public_bring_sheet / claim_bring_item / suggest_bring_item /
-- update_bring_claim_by_token / release_bring_claim_by_token (security definer,
-- rate limited, token scoped). RLS alone was the only thing standing in the way.
REVOKE ALL ON public.event_bring_items FROM anon;
REVOKE ALL ON public.event_bring_claims FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_bring_items TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.event_bring_claims TO authenticated;
GRANT ALL ON public.event_bring_items TO service_role;
GRANT ALL ON public.event_bring_claims TO service_role;

-- Clear test residue from the "Payment UI Test" event.
DELETE FROM public.event_bring_claims
WHERE item_id IN (SELECT id FROM public.event_bring_items WHERE event_id = 'pay-test-1');
DELETE FROM public.event_bring_items WHERE event_id = 'pay-test-1';