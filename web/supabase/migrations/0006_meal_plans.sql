-- Meal plans (Wochenplan) with a shared shopping list. Run once in the SQL Editor.
-- Plans are shared like recipe books: owner, editors and viewers; invitations by email.

-- ---------------------------------------------------------------- tables

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.meal_plan_members (
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.book_role not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index meal_plan_members_user_idx on public.meal_plan_members (user_id);

create table public.meal_plan_invites (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.book_role not null check (role <> 'owner'),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (plan_id, email)
);
create index meal_plan_invites_email_idx on public.meal_plan_invites (email);

-- A dish on a day: a recipe (recipe_id) or a free entry ("Reste", "Essen gehen").
-- title is kept so the entry still reads well if the recipe is deleted or not visible.
create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  day date not null,
  recipe_id uuid references public.recipes (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  servings numeric check (servings is null or (servings > 0 and servings <= 100)),
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index meal_plan_entries_plan_day_idx on public.meal_plan_entries (plan_id, day);

-- The plan's shopping list.
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  checked boolean not null default false,
  -- Where the item came from: the plan entry (so a week isn't added twice) and its title.
  entry_id uuid references public.meal_plan_entries (id) on delete set null,
  source text check (char_length(source) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index shopping_items_plan_idx on public.shopping_items (plan_id);

-- ---------------------------------------------------------------- helpers

create function public.plan_role_of(p_plan uuid)
returns public.book_role
language sql stable security definer set search_path = public
as $$
  select role from public.meal_plan_members
  where plan_id = p_plan and user_id = auth.uid()
$$;

create function public.shares_plan_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.meal_plan_members mine
    join public.meal_plan_members theirs on theirs.plan_id = mine.plan_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  )
$$;

-- ---------------------------------------------------------------- triggers

create function public.handle_new_plan()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.meal_plan_members (plan_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger on_plan_created
  after insert on public.meal_plans
  for each row execute function public.handle_new_plan();

-- New accounts: also turn pending plan invitations into memberships.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email));

  insert into public.book_members (book_id, user_id, role)
  select book_id, new.id, role from public.book_invites where email = lower(new.email)
  on conflict do nothing;
  delete from public.book_invites where email = lower(new.email);

  insert into public.meal_plan_members (plan_id, user_id, role)
  select plan_id, new.id, role from public.meal_plan_invites where email = lower(new.email)
  on conflict do nothing;
  delete from public.meal_plan_invites where email = lower(new.email);

  return new;
end;
$$;

-- ---------------------------------------------------------------- row level security

alter table public.meal_plans enable row level security;
alter table public.meal_plan_members enable row level security;
alter table public.meal_plan_invites enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.shopping_items enable row level security;

-- People who share a plan may see each other's profile (email in the member list).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_book_with(id) or public.shares_plan_with(id));

create policy plans_select on public.meal_plans for select to authenticated
  using (public.plan_role_of(id) is not null);
create policy plans_insert on public.meal_plans for insert to authenticated
  with check (owner_id = auth.uid());
create policy plans_update on public.meal_plans for update to authenticated
  using (public.plan_role_of(id) = 'owner') with check (owner_id = auth.uid());
create policy plans_delete on public.meal_plans for delete to authenticated
  using (public.plan_role_of(id) = 'owner');

create policy plan_members_select on public.meal_plan_members for select to authenticated
  using (public.plan_role_of(plan_id) is not null);
create policy plan_members_insert on public.meal_plan_members for insert to authenticated
  with check (public.plan_role_of(plan_id) = 'owner' and role <> 'owner');
create policy plan_members_update on public.meal_plan_members for update to authenticated
  using (public.plan_role_of(plan_id) = 'owner' and role <> 'owner')
  with check (role <> 'owner');
create policy plan_members_delete on public.meal_plan_members for delete to authenticated
  using (role <> 'owner' and (public.plan_role_of(plan_id) = 'owner' or user_id = auth.uid()));

create policy plan_invites_select on public.meal_plan_invites for select to authenticated
  using (public.plan_role_of(plan_id) = 'owner');
create policy plan_invites_delete on public.meal_plan_invites for delete to authenticated
  using (public.plan_role_of(plan_id) = 'owner');

-- Entries and shopping items: members read, owners and editors write.
create policy entries_select on public.meal_plan_entries for select to authenticated
  using (public.plan_role_of(plan_id) is not null);
create policy entries_insert on public.meal_plan_entries for insert to authenticated
  with check (public.plan_role_of(plan_id) in ('owner', 'editor') and created_by = auth.uid());
create policy entries_update on public.meal_plan_entries for update to authenticated
  using (public.plan_role_of(plan_id) in ('owner', 'editor'))
  with check (public.plan_role_of(plan_id) in ('owner', 'editor'));
create policy entries_delete on public.meal_plan_entries for delete to authenticated
  using (public.plan_role_of(plan_id) in ('owner', 'editor'));

create policy shopping_select on public.shopping_items for select to authenticated
  using (public.plan_role_of(plan_id) is not null);
create policy shopping_insert on public.shopping_items for insert to authenticated
  with check (public.plan_role_of(plan_id) in ('owner', 'editor') and created_by = auth.uid());
-- Everyone in the plan may tick items off while shopping; viewers can't change anything else.
create policy shopping_update on public.shopping_items for update to authenticated
  using (public.plan_role_of(plan_id) is not null)
  with check (public.plan_role_of(plan_id) is not null);

create function public.shopping_viewer_only_ticks()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.plan_role_of(old.plan_id) = 'viewer'
     and (new.text, new.plan_id, new.entry_id, new.source) is distinct from (old.text, old.plan_id, old.entry_id, old.source) then
    raise exception 'Viewers can only tick items off' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger shopping_viewer_only_ticks
  before update on public.shopping_items
  for each row execute function public.shopping_viewer_only_ticks();
create policy shopping_delete on public.shopping_items for delete to authenticated
  using (public.plan_role_of(plan_id) in ('owner', 'editor'));

-- ---------------------------------------------------------------- permissions (see 0002)

grant select, insert, update, delete on
  public.meal_plans, public.meal_plan_members, public.meal_plan_invites,
  public.meal_plan_entries, public.shopping_items
  to authenticated;
grant execute on function public.plan_role_of(uuid), public.shares_plan_with(uuid) to authenticated;
