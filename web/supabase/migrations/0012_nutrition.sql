-- Nutrition facts of a recipe (kcal, protein, fat, carbs, sugar, fiber, salt), with their
-- basis (per serving / whole recipe / 100 g) and where they come from (source, AI estimate,
-- own entry). Run once in the SQL Editor.

alter table public.recipes
  add column if not exists nutrition jsonb
  check (nutrition is null or jsonb_typeof(nutrition) = 'object');
