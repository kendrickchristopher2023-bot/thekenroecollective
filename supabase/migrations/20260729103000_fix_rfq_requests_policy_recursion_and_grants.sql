-- Fixes "infinite recursion detected in policy for relation rfq_requests",
-- hit when sending an RFQ from the AI Packages panel.
--
-- Root cause: rfq_requests' SELECT policy directly queried rfq_invitations
-- (to check "is this a vendor invited to this RFQ"), and rfq_invitations'
-- own SELECT policy directly queried rfq_requests back — a mutual
-- cross-table RLS cycle. Postgres evaluates RLS on every table touched
-- inside a policy expression, including ones referenced from another
-- table's policy, so any query into either table hit an infinite loop.
--
-- Fix: same pattern this project already uses for has_role() — move the
-- cross-table check into a STABLE SECURITY DEFINER function, so it runs
-- with elevated privilege and never re-triggers RLS on the tables it
-- reads internally.
CREATE OR REPLACE FUNCTION public.rfq_invited_vendor_owner(_rfq_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM rfq_invitations i
    JOIN vendors v ON v.id = i.vendor_id
    WHERE i.rfq_id = _rfq_id AND v.owner_user_id = _user_id
  )
$function$;

DROP POLICY IF EXISTS "Requester and vendor owner can view RFQ" ON public.rfq_requests;

CREATE POLICY "Requester and vendor owner can view RFQ" ON public.rfq_requests
FOR SELECT
USING (
  auth.uid() = requester_user_id
  OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = rfq_requests.vendor_id AND v.owner_user_id = auth.uid())
  OR public.rfq_invited_vendor_owner(rfq_requests.id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'owner'::app_role)
);

-- Separate bug found while verifying the fix above: rfq_invitations and
-- vendors were both missing the table-level SELECT grant that every
-- sibling RFQ/vendor table already has, so even with RLS correct, any
-- client-side read (including the public vendor directory, which reads
-- vendors as the anon role) failed with "permission denied for table ...".
GRANT SELECT ON public.rfq_invitations TO authenticated, anon;
GRANT SELECT ON public.vendors TO authenticated, anon;
