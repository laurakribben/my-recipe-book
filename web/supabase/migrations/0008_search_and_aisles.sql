-- Search across all of the user's recipe books, and supermarket aisles on the shopping list.
-- Run once in the SQL Editor.

-- Finds recipes in the books the user is a member of where every word appears in the
-- title, a tag or an ingredient. SECURITY INVOKER: the recipes' access rules still apply.
create or replace function public.search_recipes(words text[])
returns setof public.recipes
language sql stable security invoker set search_path = public
as $$
  select r.*
  from public.recipes r
  where r.book_id in (select book_id from public.book_members where user_id = auth.uid())
    and not exists (
      select 1 from unnest(words) as w(word)
      where not (
        r.title ilike '%' || w.word || '%'
        or exists (select 1 from unnest(r.tags) as t(tag) where t.tag ilike '%' || w.word || '%')
        or r.ingredients::text ilike '%' || w.word || '%'
      )
    )
  order by (r.title ilike '%' || words[1] || '%') desc, r.updated_at desc
  limit 100
$$;

grant execute on function public.search_recipes(text[]) to authenticated;

-- Supermarket aisle of a shopping item ("Obst & Gemüse", "Kühlregal" …), set by the AI.
alter table public.shopping_items
  add column if not exists aisle text check (char_length(aisle) <= 50);
