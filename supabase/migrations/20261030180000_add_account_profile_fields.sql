-- Add basic profile fields required by customer and dealer account signup.
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists gender text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_gender_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_gender_check
      check (gender is null or gender in ('female','male','non_binary','prefer_not_to_say'));
  end if;
end $$;
create index if not exists dealer_applications_status_submitted_idx
  on public.dealer_applications (status, submitted_at desc);
