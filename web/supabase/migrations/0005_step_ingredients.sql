-- Ingredients (with amounts) used in each step, shown under the step in cooking mode.
-- One list per step, in step order, e.g. [["80 g Butter", "120 ml Vollmilch"], [], ...].
-- Filled in by the AI; null when not assigned yet. Run once in the SQL Editor.

alter table public.recipes
  add column if not exists step_ingredients jsonb
  check (step_ingredients is null or jsonb_typeof(step_ingredients) = 'array');
