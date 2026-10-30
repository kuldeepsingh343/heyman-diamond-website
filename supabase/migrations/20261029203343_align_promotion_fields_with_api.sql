-- Keeps the promotions table aligned with fields consumed by server/index.mjs.
alter table public.promotions
  add column if not exists max_redemptions integer
  check (max_redemptions is null or max_redemptions > 0);

alter table public.promotions
  add column if not exists combinable boolean not null default false;

alter table public.promotions
  add column if not exists banner_enabled boolean not null default false;

alter table public.promotions
  add column if not exists banner_text text not null default '';
