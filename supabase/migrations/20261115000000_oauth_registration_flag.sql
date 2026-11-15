-- Migration: Add explicit registration flag to public.profiles and update handle_new_user trigger
-- Distinguishes between completed customer/dealer registrations and raw OAuth user entries.

alter table public.profiles add column if not exists is_registered boolean not null default false;

-- Backfill existing active profiles: Any profile that already has phone, address, gender, or is an admin/staff
update public.profiles
set is_registered = true
where phone is not null
   or address is not null
   or gender is not null
   or account_type in ('customer', 'dealer');

-- Update handle_new_user trigger function to respect explicit is_registered metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, is_registered)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce((new.raw_user_meta_data ->> 'is_registered')::boolean, false)
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    is_registered = case when excluded.is_registered = true then true else public.profiles.is_registered end;
  return new;
end;
$$;
