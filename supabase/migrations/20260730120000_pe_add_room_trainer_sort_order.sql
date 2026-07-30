alter table "public"."pe_rooms" add column "sort_order" integer not null default 0;
alter table "public"."pe_trainers" add column "sort_order" integer not null default 0;

with ordered as (
	select id, row_number() over (order by name) - 1 as rn
	from public.pe_rooms
)
update public.pe_rooms r
set sort_order = ordered.rn
from ordered
where ordered.id = r.id;

with ordered as (
	select id, row_number() over (order by name) - 1 as rn
	from public.pe_trainers
)
update public.pe_trainers t
set sort_order = ordered.rn
from ordered
where ordered.id = t.id;
