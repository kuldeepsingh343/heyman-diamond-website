-- This application uses the trusted server API for all public-schema data access.
-- The server's service-role credential is server-only. Browser roles must not have
-- direct table, sequence, or function privileges; RLS remains defense in depth.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

-- Prevent future objects created by the migration owner from regaining broad
-- browser privileges through PostgreSQL default grants.
alter default privileges in schema public revoke all privileges on tables from anon, authenticated;
alter default privileges in schema public revoke all privileges on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
