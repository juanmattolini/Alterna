-- El período de reserva pasa de semanas (desde el lunes) a días corridos desde hoy.
alter table public.office_config add column if not exists horizon_days smallint not null default 14
  check (horizon_days between 1 and 120);
update public.office_config set horizon_days = least(120, horizon_weeks * 7) where id = 1;

create or replace function public.check_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cfg public.office_config; r text;
begin
  select * into cfg from public.office_config where id = 1;
  if extract(isodow from new.date) > 5 then raise exception 'Solo se reserva de lunes a viernes'; end if;
  if new.date < current_date then raise exception 'No se puede reservar un día pasado'; end if;
  if new.date >= current_date + cfg.horizon_days then
    raise exception 'Fuera del período de reserva'; end if;
  select reason into r from public.closures where date = new.date;
  if found then raise exception 'La oficina está cerrada ese día: %', r; end if;
  return new;
end $$;

create or replace function public.materialize_recurring(only_user uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.office_config; r record; d date; pick text; made int := 0;
  first_day date := current_date;
  last_day date;
begin
  select * into cfg from public.office_config where id = 1;
  last_day := current_date + cfg.horizon_days - 1;
  for r in select * from public.recurring where only_user is null or user_id = only_user loop
    d := first_day;
    while d <= last_day loop
      if extract(isodow from d) <= 5
         and (extract(isodow from d)::int - 1) = any (r.days)
         and not exists (select 1 from public.closures c where c.date = d)
         and not exists (select 1 from public.recurring_skips s where s.user_id = r.user_id and s.date = d)
         and not exists (select 1 from public.bookings b where b.user_id = r.user_id and b.date = d) then
        with desks as (
          select z.id as zone, z.sort, z.id || '-' || lpad(n::text, 2, '0') as desk_id
          from public.zones z, generate_series(1, z.desks) n
          where not (n = any (z.off_desks))
        ), free as (
          select * from desks where desk_id not in (select desk_id from public.bookings where date = d)
        )
        select desk_id into pick from free
        order by (desk_id = r.desk_id) desc, (zone = split_part(r.desk_id, '-', 1)) desc, sort, desk_id
        limit 1;
        if pick is not null then
          begin
            insert into public.bookings (date, desk_id, user_id) values (d, pick, r.user_id);
            made := made + 1;
          exception when unique_violation then null;
          end;
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;
  return made;
end $$;
