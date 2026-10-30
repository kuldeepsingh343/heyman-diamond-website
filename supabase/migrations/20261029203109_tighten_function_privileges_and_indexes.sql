-- Reconstructed from live Supabase function definitions, indexes, and privilege posture.
-- RLS remains enabled with no anon/authenticated policies by design (server-mediated API).

create index audit_log_actor_user_id_idx on public.audit_log(actor_user_id);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);
create index audit_log_created_at_idx on public.audit_log(created_at desc);
create index dealer_applications_user_id_idx on public.dealer_applications(user_id);
create index dealer_applications_reviewer_user_id_idx on public.dealer_applications(reviewer_user_id);
create index dealer_applications_status_submitted_idx on public.dealer_applications(status, submitted_at desc);
create index orders_created_at_idx on public.orders(created_at desc);
create index orders_status_idx on public.orders(status);
create index orders_user_id_idx on public.orders(user_id);
create index promotions_created_by_idx on public.promotions(created_by);
create index quote_request_items_quote_id_idx on public.quote_request_items(quote_request_id);
create index quote_requests_status_created_idx on public.quote_requests(status, created_at desc);
create index quote_requests_user_created_idx on public.quote_requests(user_id, created_at desc);
create index review_replies_admin_user_id_idx on public.review_replies(admin_user_id);
create index reviews_user_id_idx on public.reviews(user_id);
create index reviews_status_submitted_idx on public.reviews(status, submitted_at desc);


revoke all on function public.handle_new_user() from public, anon, authenticated;
-- Trigger execution does not require callers to have direct EXECUTE permission.
-- The service role retains its privileged backend access; never expose its key to browsers.
