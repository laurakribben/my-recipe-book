-- Nutrition facts for free entries in the meal plan (e.g. "Pizza" without a recipe), estimated by
-- the AI from the title and typed-in ingredients so they count in the nutrition balance.
-- nutrition_checked: the estimate was tried (it stays null for things like "Essen gehen").
-- Run once in the SQL Editor.

alter table public.meal_plan_entries
  add column if not exists nutrition jsonb,
  add column if not exists nutrition_checked boolean not null default false;
