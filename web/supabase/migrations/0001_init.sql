-- Recipe book schema: users (profiles), recipe books, book members/invites, recipes.
-- Access rules are enforced with row level security (RLS) in the database.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- ---------------------------------------------------------------- types

create type public.book_role as enum ('owner', 'editor', 'viewer');
create type public.recipe_visibility as enum ('private', 'public');

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.book_members (
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.book_role not null,
  created_at timestamptz not null default now(),
  primary key (book_id, user_id)
);
create index book_members_user_idx on public.book_members (user_id);

-- Invitations for people who don't have an account yet. They become
-- memberships automatically when the invited person's account is created.
create table public.book_invites (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.book_role not null check (role <> 'owner'),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (book_id, email)
);
create index book_invites_email_idx on public.book_invites (email);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  source_url text,
  source_type text not null default 'other'
    check (source_type in ('instagram', 'website', 'youtube', 'tiktok', 'photo', 'text', 'other')),
  source_author text,
  status text not null default 'complete' check (status in ('complete', 'incomplete')),
  missing text,
  servings text,
  prep_time text,
  cook_time text,
  total_time text,
  tags text[] not null default '{}',
  -- [{ "name": "Teig" | null, "items": ["200 g Mehl", ...] }, ...]
  ingredients jsonb not null default '[]' check (jsonb_typeof(ingredients) = 'array'),
  steps text[] not null default '{}',
  notes text,
  visibility public.recipe_visibility not null default 'private',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_book_idx on public.recipes (book_id);

-- One row per AI extraction, used for a per-user daily limit (cost control).
create table public.ai_extractions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index ai_extractions_user_time_idx on public.ai_extractions (user_id, created_at);

-- ---------------------------------------------------------------- helpers

-- The current user's role in a book, or null. SECURITY DEFINER so policies
-- on book_members can use it without recursing into themselves.
create function public.book_role_of(p_book uuid)
returns public.book_role
language sql stable security definer set search_path = public
as $$
  select role from public.book_members
  where book_id = p_book and user_id = auth.uid()
$$;

create function public.shares_book_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.book_members mine
    join public.book_members theirs on theirs.book_id = mine.book_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  )
$$;

-- ---------------------------------------------------------------- triggers

-- New auth user -> profile, and turn pending invites into memberships.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email));

  insert into public.book_members (book_id, user_id, role)
  select book_id, new.id, role from public.book_invites where email = lower(new.email)
  on conflict do nothing;

  delete from public.book_invites where email = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- New book -> its creator becomes the owner member.
create function public.handle_new_book()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.book_members (book_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger on_book_created
  after insert on public.books
  for each row execute function public.handle_new_book();

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_touch_updated_at
  before update on public.recipes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.book_members enable row level security;
alter table public.book_invites enable row level security;
alter table public.recipes enable row level security;
alter table public.ai_extractions enable row level security;

-- profiles: see yourself and people you share a book with; edit only yourself.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_book_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- books: members can see; anyone logged in can create their own; owners manage.
create policy books_select on public.books for select to authenticated
  using (public.book_role_of(id) is not null);
create policy books_insert on public.books for insert to authenticated
  with check (owner_id = auth.uid());
create policy books_update on public.books for update to authenticated
  using (public.book_role_of(id) = 'owner') with check (owner_id = auth.uid());
create policy books_delete on public.books for delete to authenticated
  using (public.book_role_of(id) = 'owner');

-- book_members: members see each other; owners add/change/remove others;
-- anyone but the owner can leave.
create policy members_select on public.book_members for select to authenticated
  using (public.book_role_of(book_id) is not null);
create policy members_insert on public.book_members for insert to authenticated
  with check (public.book_role_of(book_id) = 'owner' and role <> 'owner');
create policy members_update on public.book_members for update to authenticated
  using (public.book_role_of(book_id) = 'owner' and role <> 'owner')
  with check (role <> 'owner');
create policy members_delete on public.book_members for delete to authenticated
  using (role <> 'owner' and (public.book_role_of(book_id) = 'owner' or user_id = auth.uid()));

-- book_invites: only the book owner sees and withdraws them (created by the server).
create policy invites_select on public.book_invites for select to authenticated
  using (public.book_role_of(book_id) = 'owner');
create policy invites_delete on public.book_invites for delete to authenticated
  using (public.book_role_of(book_id) = 'owner');

-- recipes: public ones are readable by everyone (also logged out); private ones
-- only by book members. Owners and editors write.
create policy recipes_select on public.recipes for select to anon, authenticated
  using (visibility = 'public' or public.book_role_of(book_id) is not null);
create policy recipes_insert on public.recipes for insert to authenticated
  with check (public.book_role_of(book_id) in ('owner', 'editor') and created_by = auth.uid());
create policy recipes_update on public.recipes for update to authenticated
  using (public.book_role_of(book_id) in ('owner', 'editor'))
  with check (public.book_role_of(book_id) in ('owner', 'editor'));
create policy recipes_delete on public.recipes for delete to authenticated
  using (public.book_role_of(book_id) in ('owner', 'editor'));

-- ai_extractions: users record and see only their own.
create policy extractions_select on public.ai_extractions for select to authenticated
  using (user_id = auth.uid());
create policy extractions_insert on public.ai_extractions for insert to authenticated
  with check (user_id = auth.uid());
