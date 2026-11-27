-- Order of the entries within a cell of the week table (drag and drop). Run once in the SQL Editor.
-- New entries get the current time as position, so they land at the end of their cell;
-- reordering a cell sets small numbers (0, 1, 2 …) for its entries.

alter table public.meal_plan_entries
  add column if not exists position double precision not null
  default (extract(epoch from clock_timestamp()) * 1000);

-- Keep today's order (by creation time) for existing entries.
update public.meal_plan_entries set position = extract(epoch from created_at) * 1000;
