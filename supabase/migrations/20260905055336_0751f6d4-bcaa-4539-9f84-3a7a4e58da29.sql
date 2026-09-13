-- a. Align grants with the access rules that already exist on these tables.
-- anon deliberately gets nothing: public reads go through vendors_public / vendor_reviews_public.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_reviews TO authenticated;
GRANT ALL ON public.vendor_reviews TO service_role;
-- rfq_invitations: reads only for members (both policies are SELECT); all writes go through server code.
GRANT SELECT ON public.rfq_invitations TO authenticated;
GRANT ALL ON public.rfq_invitations TO service_role;

-- b. Guard: fail loudly when a required grant is missing, or anon is ever exposed.
CREATE OR REPLACE FUNCTION public.access_drift()
RETURNS TABLE(object text, issue text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH privs AS (
  SELECT c.relname,
         pg_get_userbyid(a.grantee) AS rolname,
         a.privilege_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  WHERE n.nspname = 'public'
),
policy_roles AS (
  SELECT DISTINCT c.relname, pg_get_userbyid(pr.oid) AS rolname
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL unnest(p.polroles) AS pr(oid)
  WHERE n.nspname = 'public'
    AND pg_get_userbyid(pr.oid) IN ('anon','authenticated')
)
-- 1. Any table whose rules target a role that holds no privilege at all.
SELECT pr.relname || ' / ' || pr.rolname,
       'access rule targets this role but the role holds no privilege on the table, so every query is refused before the rules are considered'
FROM policy_roles pr
WHERE NOT EXISTS (
  SELECT 1 FROM privs p WHERE p.relname = pr.relname AND p.rolname = pr.rolname
)

UNION ALL
-- 2. Named marketplace grants that have been revoked five times before.
SELECT req.relname || ' / authenticated (' || req.privilege_type || ')',
       'required marketplace grant is missing; this is the recurring vendor permission failure'
FROM (
  SELECT 'vendors'::text AS relname, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS privilege_type
  UNION ALL
  SELECT 'vendor_reviews', unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE'])
  UNION ALL
  SELECT 'rfq_invitations', 'SELECT'
) req
WHERE NOT EXISTS (
  SELECT 1 FROM privs p
  WHERE p.relname = req.relname
    AND p.rolname = 'authenticated'
    AND p.privilege_type = req.privilege_type
)

UNION ALL
-- 3. Private tables must never be reachable by anon.
SELECT l.relname || ' / anon',
       'private table is exposed to visitors who are not signed in; vendor contact details and reviewer identity must only be reachable through the safe public views'
FROM (SELECT unnest(ARRAY['vendors','vendor_reviews','rfq_invitations']) AS relname) l
JOIN privs p ON p.relname = l.relname AND p.rolname = 'anon'

UNION ALL
-- 4. Public views must keep SELECT for both roles.
SELECT v.relname || ' / ' || r.rolname,
       'safe public view is missing SELECT for this role, so the public marketplace cannot read it'
FROM (SELECT unnest(ARRAY['vendors_public','vendor_reviews_public']) AS relname) v
CROSS JOIN (SELECT unnest(ARRAY['anon','authenticated']) AS rolname) r
WHERE NOT EXISTS (
  SELECT 1 FROM privs p
  WHERE p.relname = v.relname AND p.rolname = r.rolname AND p.privilege_type = 'SELECT'
)
$function$;

REVOKE ALL ON FUNCTION public.access_drift() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.access_drift() TO service_role;