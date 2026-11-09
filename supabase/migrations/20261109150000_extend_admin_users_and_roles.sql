-- Migration: Extend admin_users table with roles, granular permissions, and trigger hardening
-- DO NOT APPLY WITHOUT EXPLICIT USER APPROVAL

-- 1. Extend public.admin_users columns
alter table public.admin_users
  add column if not exists role text not null default 'admin' check (role in ('super_admin', 'admin', 'sales_manager', 'operations_manager')),
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists can_manage_inventory boolean not null default true,
  add column if not exists can_manage_orders boolean not null default true,
  add column if not exists can_review_kyc boolean not null default false,
  add column if not exists can_manage_promotions boolean not null default false,
  add column if not exists can_manage_reviews boolean not null default false,
  add column if not exists can_manage_users boolean not null default false,
  add column if not exists role_title text,
  add column if not exists updated_at timestamptz not null default now();

-- 2. Composite Index on (user_id, is_active) for fast authorization checks
create index if not exists idx_admin_users_user_id_active on public.admin_users (user_id, is_active);

-- 3. Harden handle_new_user() trigger to strictly prevent metadata privilege escalation
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_account_type text;
begin
  -- Strictly whitelist account_type: only 'customer' or 'dealer' allowed from signup metadata.
  -- Elevation to 'admin' is strictly forbidden via raw_user_meta_data.
  v_account_type := case 
    when (new.raw_user_meta_data ->> 'account_type') = 'dealer' then 'dealer'
    else 'customer'
  end;

  insert into public.profiles (
    id,
    full_name,
    account_type,
    dealer_status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    v_account_type,
    -- Dealer status can never be 'approved' at signup; must undergo manual review.
    case when v_account_type = 'dealer' then 'pending_review' else 'not_applied' end
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;
