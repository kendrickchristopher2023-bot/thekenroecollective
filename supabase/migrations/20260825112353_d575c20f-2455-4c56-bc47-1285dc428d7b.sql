create or replace function public.profiles_block_entitlement_self_edit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Backend/service code (Stripe webhooks, owner tools, security definer
  -- RPCs like claim_atelier_trial) runs as postgres/service_role and is
  -- allowed. Ordinary signed-in users must never change their own plan or
  -- paid feature flags by writing to their profile row.
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if new.tier is distinct from old.tier
     or new.guest_import_enabled is distinct from old.guest_import_enabled
     or new.thank_you_cards_enabled is distinct from old.thank_you_cards_enabled
     or new.converter_enabled is distinct from old.converter_enabled
     or new.sms_pack_enabled is distinct from old.sms_pack_enabled
     or new.atelier_trial_used is distinct from old.atelier_trial_used
     or new.atelier_trial_started_at is distinct from old.atelier_trial_started_at
     or new.atelier_trial_expires_at is distinct from old.atelier_trial_expires_at
  then
    raise exception 'Plan and paid feature settings can only be changed through checkout or by support.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_block_entitlement_self_edit on public.profiles;
create trigger profiles_block_entitlement_self_edit
before update on public.profiles
for each row
execute function public.profiles_block_entitlement_self_edit();

create or replace function public.profiles_block_entitlement_self_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;
  -- A self-insert (profile upsert) may only create a free profile.
  new.tier := coalesce(nullif(new.tier, ''), 'free');
  if new.tier not in ('free', 'postcard') then
    new.tier := 'free';
  end if;
  new.guest_import_enabled := coalesce(false, new.guest_import_enabled);
  new.thank_you_cards_enabled := false;
  new.converter_enabled := false;
  new.sms_pack_enabled := false;
  new.atelier_trial_used := coalesce(new.atelier_trial_used, false) and false;
  new.atelier_trial_started_at := null;
  new.atelier_trial_expires_at := null;
  return new;
end;
$$;

drop trigger if exists profiles_block_entitlement_self_insert on public.profiles;
create trigger profiles_block_entitlement_self_insert
before insert on public.profiles
for each row
execute function public.profiles_block_entitlement_self_insert();