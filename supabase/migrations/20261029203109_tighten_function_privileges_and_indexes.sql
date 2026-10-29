-- Reconstructed from the live function definitions and privilege posture.
-- The server uses the Supabase service role; browser roles receive no direct table access.
-- RLS remains enabled with no anon/authenticated policies by design (server-mediated API).

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Trigger execution does not require callers to have direct EXECUTE permission.
-- The service role retains its privileged backend access; do not expose its key to browsers.
