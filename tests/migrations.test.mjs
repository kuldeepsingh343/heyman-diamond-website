import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../supabase/migrations/', import.meta.url)

test('reconstructed migrations cover live schema and hardening', async () => {
  const initial = await readFile(new URL('20261029203058_initial_website_schema_rls.sql', root), 'utf8')
  const hardening = await readFile(new URL('20261029203109_tighten_function_privileges_and_indexes.sql', root), 'utf8')
  const promotion = await readFile(new URL('20261029203343_align_promotion_fields_with_api.sql', root), 'utf8')

  for (const table of [
    'profiles', 'admin_users', 'dealer_applications', 'orders', 'quote_requests',
    'quote_request_items', 'reviews', 'review_replies', 'audit_log', 'promotions',
  ]) {
    assert.match(initial, new RegExp('create table public\\.' + table + '\\b', 'i'), table + ' table is defined')
    assert.match(initial, new RegExp('alter table public\\.' + table + ' enable row level security', 'i'), table + ' has RLS enabled')
  }
  assert.match(initial, /create or replace function public\\.handle_new_user\\(\\)[\\s\\S]*?security definer/i)
  assert.match(initial, /set search_path = ''/i)
  assert.match(hardening, /revoke all on function public\\.handle_new_user\\(\\) from public, anon, authenticated/i)
  assert.match(hardening, /revoke all on function public\\.set_updated_at\\(\\) from public, anon, authenticated/i)
  assert.match(hardening, /create index audit_log_created_at_idx/i)
  assert.match(promotion, /add column if not exists max_redemptions/i)
  assert.match(promotion, /add column if not exists banner_text/i)
  assert.doesNotMatch(initial, /service_role_key|supabase_service_role_key/i)
})
