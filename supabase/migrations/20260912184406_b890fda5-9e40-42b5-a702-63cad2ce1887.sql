-- Keep rows that have no account when excluding the demo/showcase accounts.
-- Every exclusion predicate in the two v3 snapshot functions has the shape
--   (_exclude_user_ids IS NULL OR NOT (<col> = ANY(_exclude_user_ids)))
-- which drops NULL <col> rows because NULL = ANY(...) is NULL. Rewrite each to
--   (_exclude_user_ids IS NULL OR <col> IS NULL OR NOT (<col> = ANY(_exclude_user_ids)))
DO $$
DECLARE
  r record;
  src text;
  patched text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('owner_analytics_snapshot_v3', 'owner_contacts_snapshot_v3')
  LOOP
    src := pg_get_functiondef(r.oid);
    patched := regexp_replace(
      src,
      '\(_exclude_user_ids IS NULL OR NOT \(([A-Za-z_.]+) = ANY\(_exclude_user_ids\)\)\)',
      '(_exclude_user_ids IS NULL OR \1 IS NULL OR NOT (\1 = ANY(_exclude_user_ids)))',
      'g'
    );
    IF patched = src THEN
      RAISE EXCEPTION 'no exclusion predicates found in %', r.proname;
    END IF;
    EXECUTE patched;
  END LOOP;
END $$;

-- Signed-in only, matching v2. The functions still refuse non-owners inside.
REVOKE EXECUTE ON FUNCTION public.owner_analytics_snapshot_v3(timestamptz, timestamptz, uuid[], uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_contacts_snapshot_v3(timestamptz, timestamptz, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_analytics_snapshot_v3(timestamptz, timestamptz, uuid[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_contacts_snapshot_v3(timestamptz, timestamptz, uuid[], uuid) TO authenticated, service_role;