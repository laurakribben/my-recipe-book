-- Recipe pictures. Run once in the SQL Editor after 0001 and 0002.
--
-- Files live in the storage bucket "recipe-images" under <book id>/<recipe id>/<random id>.<ext>.
-- The bucket is public-read so pictures load fast and can be cached: a picture's address
-- contains three random ids and can't be guessed, but anyone who has the address can open it.
-- There are no storage policies on purpose: only the server (service role) uploads and
-- deletes files, after checking that the user may edit the recipe.

alter table public.recipes
  add column if not exists image_path text
  check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
