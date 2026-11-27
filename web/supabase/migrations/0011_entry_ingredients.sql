-- Ingredients typed in for a plan entry (e.g. for a free entry like "Grillabend", or extras
-- next to a recipe). They go onto the shopping list with the week's recipes.
-- Run once in the SQL Editor.

alter table public.meal_plan_entries
  add column if not exists ingredients text[] not null default '{}'
  check (cardinality(ingredients) <= 50);
