-- Migration: Add soft delete columns to diamonds_inventory
-- DO NOT APPLY WITHOUT EXPLICIT USER APPROVAL

alter table public.diamonds_inventory
  add column if not exists deleted_at timestamptz default null,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists idx_diamonds_inventory_deleted_at
  on public.diamonds_inventory (deleted_at);

