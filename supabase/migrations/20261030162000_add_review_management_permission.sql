-- Review moderation and replies use their own permission, separate from orders.
alter table public.admin_users
  add column if not exists can_manage_reviews boolean not null default false;
