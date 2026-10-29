-- Hey Man Diamond LLC initial data model.
-- Apply only to a new Supabase project after review.
-- All tables use RLS and intentionally have no client-facing policies yet.
-- Public submissions, KYC, dealer approval, pricing and orders must go through
-- trusted server-side handlers until authorization rules are tested.

create extension if not exists pgcrypto;
create type public.account_kind as enum ('retail', 'dealer');
create type public.dealer_application_status as enum ('pending_review','more_information_required','approved','rejected','suspended');
create type public.review_status as enum ('published','hidden');
create type public.order_status as enum ('inquiry','pending_payment','paid','processing','fulfilled','cancelled','refunded');
create type public.discount_kind as enum ('percentage','fixed_amount');
create type public.notification_channel as enum ('in_app','email');
create type public.notification_status as enum ('pending','sent','failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_kind public.account_kind not null default 'retail',
  display_name text not null,
  phone text,
  dealer_status public.dealer_application_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_status_for_dealers check (account_kind = 'dealer' or dealer_status is null)
);

-- Store tax IDs encrypted by the trusted application before insert.
create table public.dealer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status public.dealer_application_status not null default 'pending_review',
  registered_business_name text not null,
  company_dba text,
  registered_address text not null,
  primary_contact text not null,
  primary_email text not null,
  telephone text not null,
  cell_phone text,
  website text,
  ship_to_address text,
  business_tax_id_ciphertext text not null,
  jbt_id text not null,
  incorporation_year integer not null check (incorporation_year between 1800 and 2200),
  accounts_payable_contact text not null,
  accounts_payable_email text,
  accounts_payable_phone text not null,
  owners_directors text not null,
  bank_name text not null,
  bank_address text,
  aml_program_answer text not null check (aml_program_answer in ('Yes','No','Maybe')),
  trade_references jsonb not null default '[]'::jsonb check (jsonb_typeof(trade_references) = 'array'),
  digital_signature_name text not null,
  reviewer_user_id uuid references auth.users(id),
  reviewer_notes text,
  applicant_message text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_email text not null,
  rating smallint not null check (rating between 1 and 5),
  remarks text not null check (length(trim(remarks)) between 1 and 2000),
  status public.review_status not null default 'published',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id),
  reply_text text not null check (length(trim(reply_text)) between 1 and 3000),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  title text not null,
  body text not null,
  channel public.notification_channel not null default 'in_app',
  status public.notification_status not null default 'pending',
  read_at timestamptz,
  sent_at timestamptz,
  last_error text,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  public_code text unique,
  description text,
  discount_kind public.discount_kind not null,
  discount_value numeric(12,2) not null check (discount_value > 0),
  currency char(3) not null default 'USD',
  eligibility jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  combinable boolean not null default false,
  banner_enabled boolean not null default false,
  banner_text text,
  active boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (discount_kind <> 'percentage' or discount_value <= 100)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  user_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  customer_name text not null,
  status public.order_status not null default 'inquiry',
  currency char(3) not null default 'USD',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(12,2) not null default 0 check (tax_total >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  promotion_id uuid references public.promotions(id),
  payment_provider text,
  payment_reference text,
  customer_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  flomiz_sku text not null,
  product_snapshot jsonb not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index dealer_applications_status_submitted_idx on public.dealer_applications(status, submitted_at desc);
create index reviews_status_submitted_idx on public.reviews(status, submitted_at desc);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index orders_user_created_idx on public.orders(user_id, created_at desc);
create index orders_status_created_idx on public.orders(status, created_at desc);
create index promotions_active_window_idx on public.promotions(active, starts_at, ends_at);

alter table public.profiles enable row level security;
alter table public.dealer_applications enable row level security;
alter table public.reviews enable row level security;
alter table public.review_replies enable row level security;
alter table public.notifications enable row level security;
alter table public.promotions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.audit_log enable row level security;

-- Do not add broad policies such as "authenticated can access all rows".
-- Add least-privilege policies after admin roles and ownership rules are tested.
