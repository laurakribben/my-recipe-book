-- Separate daily limits: reading a recipe with AI ("extract") and the small calls that fill in
-- what a recipe is missing – nutrition, ingredients per step, shopping aisles ("complete").
-- Earlier rows count as extractions. Run once in the SQL Editor.

alter table public.ai_extractions
  add column if not exists kind text not null default 'extract'
    check (kind in ('extract', 'complete'));

create index if not exists ai_extractions_user_kind_time
  on public.ai_extractions (user_id, kind, created_at);
