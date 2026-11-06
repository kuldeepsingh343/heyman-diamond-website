-- Separate allowlist for admin access. Add only trusted auth.users IDs manually.
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_review_kyc boolean not null default false,
  can_manage_orders boolean not null default false,
  can_manage_promotions boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
-- No browser policies: server reads this allowlist with its service-role key.
