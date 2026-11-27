-- Explicit table and function permissions for the app's database roles.
-- Supabase doesn't always grant these automatically (it depends on the project's
-- "Grant API access to new tables automatically" setting); without them every
-- request fails with error 42501. Row level security from 0001_init.sql still
-- decides which rows each person can see or change. Safe to run more than once.

grant usage on schema public to anon, authenticated;

-- Logged-in users: row level security limits what they can do.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Logged-out visitors: only reading recipes (and RLS allows only public ones).
grant select on public.recipes to anon;

-- Helper functions used by the access rules.
grant execute on function public.book_role_of(uuid), public.shares_book_with(uuid) to anon, authenticated;
