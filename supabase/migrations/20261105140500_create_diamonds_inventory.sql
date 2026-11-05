create table if not exists public.diamonds_inventory (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  category text not null default 'Certified Diamonds',
  shape text not null default 'Round',
  carat numeric not null default 1.0,
  color text not null default 'G',
  clarity text not null default 'VS1',
  cut text default 'Excellent',
  polish text default 'Excellent',
  symmetry text default 'Very Good',
  fluorescence text default 'None',
  lab text default 'IGI',
  certificate_number text default 'N/A',
  customer_price numeric not null default 0,
  dealer_price numeric not null default 0,
  measurements text default 'N/A',
  image_url text,
  video_url text,
  status text not null default 'pending_review',
  source text not null default 'excel_upload',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_diamonds_inventory_status on public.diamonds_inventory (status);
create index if not exists idx_diamonds_inventory_category on public.diamonds_inventory (category);
create index if not exists idx_diamonds_inventory_sku on public.diamonds_inventory (sku);

alter table public.diamonds_inventory enable row level security;

grant all privileges on table public.diamonds_inventory to service_role;
grant all privileges on table public.diamonds_inventory to postgres;
