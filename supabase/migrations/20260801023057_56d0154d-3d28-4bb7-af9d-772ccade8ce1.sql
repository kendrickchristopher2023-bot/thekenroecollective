-- Reports the authenticator assurance level of the *current request's* token.
-- aal1 = password only, aal2 = password + verified second factor.
create or replace function public.current_auth_aal()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    'aal1'
  );
$$;

-- True when the account has at least one verified TOTP factor enrolled.
create or replace function public.has_verified_mfa(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = _user_id
      and f.status = 'verified'
  );
$$;

revoke all on function public.current_auth_aal() from public, anon;
revoke all on function public.has_verified_mfa(uuid) from public, anon;
grant execute on function public.current_auth_aal() to authenticated;
grant execute on function public.has_verified_mfa(uuid) to authenticated;
grant execute on function public.current_auth_aal() to service_role;
grant execute on function public.has_verified_mfa(uuid) to service_role;