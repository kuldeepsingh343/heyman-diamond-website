-- Customer price negotiation: one saved quote request contains selected diamonds
-- and a proposed unit price for each item. Admins see new requests in the portal.
create type public.quote_request_status as enum ('new','under_review','counter_offered','accepted','declined','converted_to_order','closed');

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  quote_number bigint generated always as identity unique,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_email text not null,
  customer_message text,
  status public.quote_request_status not null default 'new',
  admin_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_request_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  flomiz_sku text not null,
  product_name text not null,
  product_snapshot jsonb not null default '{}'::jsonb,
  quantity integer not null default 1 check (quantity between 1 and 100),
  current_unit_price numeric(12,2) check (current_unit_price is null or current_unit_price >= 0),
  requested_unit_price numeric(12,2) not null check (requested_unit_price > 0),
  created_at timestamptz not null default now()
);

create index quote_requests_status_created_idx on public.quote_requests(status, created_at desc);
create index quote_request_items_quote_idx on public.quote_request_items(quote_request_id);

alter table public.quote_requests enable row level security;
alter table public.quote_request_items enable row level security;

-- No browser-facing policies: submit and read quote requests only via trusted API.
