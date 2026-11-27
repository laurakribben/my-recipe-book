-- Meal of a plan entry: Morgens, Mittags, Abends or Snack (rows of the week table).
-- Existing entries become "abends". Run once in the SQL Editor.

alter table public.meal_plan_entries
  add column if not exists meal text not null default 'abends'
  check (meal in ('morgens', 'mittags', 'abends', 'snack'));
