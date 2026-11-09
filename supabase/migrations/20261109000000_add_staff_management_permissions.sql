-- Staff and role management columns for granular operational access delegation
alter table public.admin_users
  add column if not exists can_manage_inventory boolean not null default true,
  add column if not exists can_manage_team boolean not null default false,
  add column if not exists role_title text not null default 'Operations Manager';

