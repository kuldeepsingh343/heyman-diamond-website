-- Diamond Inquiries: allows signed-in customers to submit inquiries with stone details and remarks.
-- Admins can view customer diamond inquiries and reply directly from the admin panel.

create table if not exists public.diamond_inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_number bigint generated always as identity unique,
  user_id uuid references auth.users(id) on delete set null,
  diamond_sku text not null,
  diamond_shape text,
  diamond_carat numeric(8,2),
  diamond_color text,
  diamond_clarity text,
  diamond_cut text,
  diamond_price numeric(12,2),
  diamond_details jsonb default '{}'::jsonb,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  remarks text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'replied', 'closed')),
  admin_reply text,
  replied_at timestamptz,
  replied_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists diamond_inquiries_status_created_idx on public.diamond_inquiries(status, created_at desc);
create index if not exists diamond_inquiries_sku_idx on public.diamond_inquiries(diamond_sku);
create index if not exists diamond_inquiries_user_idx on public.diamond_inquiries(user_id, created_at desc);

alter table public.diamond_inquiries enable row level security;
