-- Personal setting: show the nutrition balance (ratio of carbs, fat, protein, sugar) in the
-- meal plan. Each person decides for themselves, also in shared plans. Run once in the SQL Editor.

alter table public.profiles
  add column if not exists show_nutrition_balance boolean not null default true;
