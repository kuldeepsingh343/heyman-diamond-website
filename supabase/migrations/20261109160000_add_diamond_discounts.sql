-- Migration: Add customer and dealer discount pricing to diamonds_inventory
-- DO NOT APPLY WITHOUT EXPLICIT USER APPROVAL

alter table public.diamonds_inventory
  add column if not exists customer_discount_price numeric(12,2) default null,
  add column if not exists customer_discount_percent numeric(5,2) default null,
  add column if not exists dealer_discount_price numeric(12,2) default null,
  add column if not exists dealer_discount_percent numeric(5,2) default null;

-- Ensure check constraints on customer discount pricing
alter table public.diamonds_inventory
  drop constraint if exists chk_diamonds_inventory_customer_discount,
  add constraint chk_diamonds_inventory_customer_discount check (
    (customer_discount_price is null and customer_discount_percent is null) or
    (
      customer_discount_price is not null and
      customer_discount_percent is not null and
      customer_discount_price > 0 and
      customer_discount_price < customer_price and
      customer_discount_percent > 0 and
      customer_discount_percent < 100
    )
  );

-- Ensure check constraints on dealer discount pricing
alter table public.diamonds_inventory
  drop constraint if exists chk_diamonds_inventory_dealer_discount,
  add constraint chk_diamonds_inventory_dealer_discount check (
    (dealer_discount_price is null and dealer_discount_percent is null) or
    (
      dealer_discount_price is not null and
      dealer_discount_percent is not null and
      dealer_discount_price > 0 and
      dealer_discount_price < dealer_price and
      dealer_discount_percent > 0 and
      dealer_discount_percent < 100
    )
  );

