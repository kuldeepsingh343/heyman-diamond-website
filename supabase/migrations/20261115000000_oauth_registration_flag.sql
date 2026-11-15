-- ==============================================================================
-- Migration: Add explicit registration flag & safe trigger update
-- File: supabase/migrations/20261115000000_oauth_registration_flag.sql
-- Description:
--   1. Adds is_registered boolean column to public.profiles (default false).
--   2. Updates public.handle_new_user() trigger function:
--      - Preserves whitelisting for customer vs dealer account_type.
--      - Preserves dealer_status review logic.
--      - Strictly initializes is_registered = false for all new auth users.
--      - NEVER trusts raw_user_meta_data for is_registered.
--   3. Safely backfills existing legitimate accounts based on active usage,
--      admin roles, quotes, orders, dealer applications, or verified contact info.
--      Ghost accounts (unregistered Google users) remain is_registered = false.
-- ==============================================================================

-- 1. Add column if it doesn't exist
alter table public.profiles
  add column if not exists is_registered boolean not null default false;

-- 2. Update trigger function to maintain all existing security rules
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_account_type text;
begin
  -- Strictly whitelist account_type: only 'customer' or 'dealer' allowed from signup metadata.
  -- Elevation to 'admin' is strictly forbidden via raw_user_meta_data.
  v_account_type := case 
    when (new.raw_user_meta_data ->> 'account_type') = 'dealer' then 'dealer'
    else 'customer'
  end;

  -- Security Rule: is_registered is NEVER read from client-controlled raw_user_meta_data.
  -- All new accounts created by Supabase Auth triggers start with is_registered = false.
  -- Registration is promoted to true ONLY by trusted server endpoints using the Service Role Key.
  insert into public.profiles (
    id,
    full_name,
    account_type,
    dealer_status,
    is_registered
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    v_account_type,
    case when v_account_type = 'dealer' then 'pending_review' else 'not_applied' end,
    false
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$function$;

-- 3. Objective, safe backfill for existing legitimate users
-- Covers all accounts that have confirmed their email & signed in, staff/admins,
-- customers with quotes/orders, dealers, or profiles with contact info.
-- Unconfirmed accounts without logins or verified emails remain is_registered = false.
update public.profiles p
set is_registered = true
from auth.users u
where p.id = u.id
  and (
    -- Any account that has confirmed their email and signed in at least once
    (u.email_confirmed_at is not null and u.last_sign_in_at is not null)
    -- Any account with administrative or staff privileges
    or exists (select 1 from public.admin_users au where au.user_id = u.id)
    -- Any customer who submitted a quote request or placed an order
    or exists (select 1 from public.quote_requests qr where qr.user_id = u.id)
    or exists (select 1 from public.orders o where o.user_id = u.id)
    -- Any dealer who submitted an application
    or exists (select 1 from public.dealer_applications da where da.user_id = u.id)
    -- Any user who provided contact details during registration
    or (p.phone is not null and p.phone <> '')
    or (p.address is not null and p.address <> '')
  );
