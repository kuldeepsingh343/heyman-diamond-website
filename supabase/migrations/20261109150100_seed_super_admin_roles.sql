-- Migration: Seed designated super_admin accounts
-- PROMOTES ONLY:
-- 1. kuldeepsingh343@gmail.com
-- 2. info@heymandiamond.com
-- 3. heymandiamondllc@gmail.com
-- Condition: Supabase auth.users record exists and email_confirmed_at IS NOT NULL.
-- DO NOT APPLY WITHOUT EXPLICIT USER APPROVAL

update public.admin_users au
set 
  role = 'super_admin',
  is_active = true,
  can_manage_inventory = true,
  can_manage_orders = true,
  can_review_kyc = true,
  can_manage_promotions = true,
  can_manage_reviews = true,
  can_manage_users = true,
  role_title = 'Super Administrator',
  updated_at = now()
from auth.users u
where au.user_id = u.id
  and u.email_confirmed_at is not null
  and lower(u.email) in (
    'kuldeepsingh343@gmail.com',
    'info@heymandiamond.com',
    'heymandiamondllc@gmail.com'
  );

-- Update profiles table account_type to 'admin' for those super admins
update public.profiles p
set account_type = 'admin', updated_at = now()
from auth.users u
where p.id = u.id
  and u.email_confirmed_at is not null
  and lower(u.email) in (
    'kuldeepsingh343@gmail.com',
    'info@heymandiamond.com',
    'heymandiamondllc@gmail.com'
  );
