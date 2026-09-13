-- Access drift detector.
--
-- Five separate times, a vendor/RFQ table ended up in a state where a query was
-- rejected at the GRANT layer before RLS was ever evaluated ("permission denied
-- for table ..."), and it was only ever found by a human querying at random.
-- This function encodes what "correct" means so a scheduled job can find
-- occurrence six instead.
--
-- Rule 1 (generic): if a table has an RLS policy that targets anon or
-- authenticated, that role must hold at least one privilege on the table.
-- Otherwise the policy is dead code and the query fails before RLS runs.
-- Tables that are deliberately service-role-only are exempt (rule 2 covers
-- them).
--
-- Rule 2 (specific): the vendor privacy lockdown. public.vendors and
-- public.vendor_reviews must expose NOTHING to anon/authenticated, and the safe
-- views vendors_public / vendor_reviews_public must expose SELECT to both. Both
-- halves matter: re-granting the base tables leaks contact data and reviewer
-- identity; losing the view grants breaks the marketplace.

CREATE OR REPLACE FUNCTION public.access_drift()
RETURNS TABLE(object text, issue text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH locked AS (
  SELECT unnest(ARRAY['vendors','vendor_reviews']) AS relname
),
privs AS (
  SELECT c.relname,
         pg_get_userbyid(a.grantee) AS rolname,
         a.privilege_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  WHERE n.nspname = 'public'
),
policy_roles AS (
  SELECT DISTINCT c.relname, pg_get_userbyid(r.oid) AS rolname
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL unnest(p.polroles) AS pr(oid)
  JOIN pg_roles r ON r.oid = pr.oid
  WHERE n.nspname = 'public'
    AND pg_get_userbyid(pr.oid) IN ('anon','authenticated')
)
SELECT pr.relname || ' / ' || pr.rolname,
       'access rule targets this role but the role holds no privilege on the table, so every query is refused before the rules are considered'
FROM policy_roles pr
WHERE pr.relname NOT IN (SELECT relname FROM locked)
  AND NOT EXISTS (
    SELECT 1 FROM privs p WHERE p.relname = pr.relname AND p.rolname = pr.rolname
  )

UNION ALL
SELECT l.relname || ' / ' || p.rolname,
       'privacy-locked table is exposed to this role; vendor contact details and reviewer identity must only be reachable through the safe public views'
FROM locked l
JOIN privs p ON p.relname = l.relname
WHERE p.rolname IN ('anon','authenticated')

UNION ALL
SELECT v.relname || ' / ' || r.rolname,
       'safe public view is missing SELECT for this role, so the public marketplace cannot read it'
FROM (SELECT unnest(ARRAY['vendors_public','vendor_reviews_public']) AS relname) v
CROSS JOIN (SELECT unnest(ARRAY['anon','authenticated']) AS rolname) r
WHERE NOT EXISTS (
  SELECT 1 FROM privs p
  WHERE p.relname = v.relname AND p.rolname = r.rolname AND p.privilege_type = 'SELECT'
)
$$;

REVOKE ALL ON FUNCTION public.access_drift() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.access_drift() TO service_role;

COMMENT ON FUNCTION public.access_drift() IS
  'Reports database access-rule drift: policies that can never run because the role holds no privilege, and any change to the vendor privacy lockdown. Called by the daily backup-watchdog worker, which alerts the owner.';