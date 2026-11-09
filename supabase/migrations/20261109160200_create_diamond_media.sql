-- Migration: Create diamond_media table for multi-media gallery management
-- DO NOT APPLY WITHOUT EXPLICIT USER APPROVAL

create table if not exists public.diamond_media (
  id uuid primary key default gen_random_uuid(),
  diamond_id uuid not null references public.diamonds_inventory(id) on delete cascade,
  type text not null check (type in ('image', 'video')),
  storage_path text not null,
  public_url text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  alt_text text default '',
  file_size bigint,
  mime_type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_diamond_media_diamond_id on public.diamond_media (diamond_id);
create index if not exists idx_diamond_media_sort_order on public.diamond_media (diamond_id, sort_order);

alter table public.diamond_media enable row level security;

-- Strictly grant table privileges to service_role and postgres only
revoke all on public.diamond_media from public, anon, authenticated;
grant all privileges on table public.diamond_media to service_role;
grant all privileges on table public.diamond_media to postgres;

