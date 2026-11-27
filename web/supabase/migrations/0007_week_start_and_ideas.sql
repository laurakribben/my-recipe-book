-- Week start per meal plan, and the idea lists "Diese Woche" / "Nächste Woche".
-- Run once in the SQL Editor.

-- 1 = Monday ... 7 = Sunday (ISO weekday numbers).
alter table public.meal_plans
  add column if not exists week_start smallint not null default 1 check (week_start between 1 and 7);

-- Recipes noted for a week without a day yet. `week` is the first day of the week the
-- recipe was noted for; the app shows everything up to the current week under
-- "Diese Woche" and the following week under "Nächste Woche".
create table public.meal_plan_ideas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  recipe_id uuid references public.recipes (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  week date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index meal_plan_ideas_plan_idx on public.meal_plan_ideas (plan_id, week);

alter table public.meal_plan_ideas enable row level security;

create policy ideas_select on public.meal_plan_ideas for select to authenticated
  using (public.plan_role_of(plan_id) is not null);
create policy ideas_insert on public.meal_plan_ideas for insert to authenticated
  with check (public.plan_role_of(plan_id) in ('owner', 'editor') and created_by = auth.uid());
create policy ideas_update on public.meal_plan_ideas for update to authenticated
  using (public.plan_role_of(plan_id) in ('owner', 'editor'))
  with check (public.plan_role_of(plan_id) in ('owner', 'editor'));
create policy ideas_delete on public.meal_plan_ideas for delete to authenticated
  using (public.plan_role_of(plan_id) in ('owner', 'editor'));

grant select, insert, update, delete on public.meal_plan_ideas to authenticated;
