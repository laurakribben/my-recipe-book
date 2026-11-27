-- Source of a recipe picture, shown under the picture ("Bild: ..."). Run once in the SQL Editor.

alter table public.recipes
  add column if not exists image_credit text check (char_length(image_credit) <= 200),
  add column if not exists image_source_url text
    check (image_source_url is null or (image_source_url ~* '^https?://' and char_length(image_source_url) <= 2000));
