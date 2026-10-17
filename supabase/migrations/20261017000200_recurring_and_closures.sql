-- Feriados y cierres + reserva recurrente

-- días sin oficina
create table public.closures (
  date date primary key,
  reason text not null default 'Oficina cerrada',
  created_at timestamptz not null default now()
);
alter table public.closures enable row level security;
create policy "closures read" on public.closures for select to authenticated using (true);
create policy "closures admin insert" on public.closures for insert to authenticated with check ((select public.is_admin()));
create policy "closures admin update" on public.closures for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "closures admin delete" on public.closures for delete to authenticated using ((select public.is_admin()));

-- una regla recurrente por persona
create table public.recurring (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  desk_id text not null,
  days smallint[] not null check (cardinality(days) between 1 and 5 and days <@ array[0,1,2,3,4]::smallint[]),
  created_at timestamptz not null default now()
);
alter table public.recurring enable row level security;
create policy "recurring read" on public.recurring for select to authenticated using (true);
create policy "recurring insert own" on public.recurring for insert to authenticated with check (user_id = (select auth.uid()));
create policy "recurring update own" on public.recurring for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recurring delete own or admin" on public.recurring for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

-- días que la persona liberó a mano: la regla no los vuelve a reservar
create table public.recurring_skips (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  primary key (user_id, date)
);
alter table public.recurring_skips enable row level security;
create policy "skips read own" on public.recurring_skips for select to authenticated using (user_id = (select auth.uid()));
create policy "skips delete own" on public.recurring_skips for delete to authenticated using (user_id = (select auth.uid()));

-- no se reserva en días cerrados
create or replace function public.check_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cfg public.office_config; r text;
begin
  select * into cfg from public.office_config where id = 1;
  if extract(isodow from new.date) > 5 then raise exception 'Solo se reserva de lunes a viernes'; end if;
  if new.date < current_date then raise exception 'No se puede reservar un día pasado'; end if;
  if new.date >= date_trunc('week', current_date)::date + cfg.horizon_weeks * 7 then
    raise exception 'Fuera del período de reserva'; end if;
  select reason into r from public.closures where date = new.date;
  if found then raise exception 'La oficina está cerrada ese día: %', r; end if;
  return new;
end $$;

-- al marcar un cierre se cancelan las reservas de ese día
create or replace function public.on_closure_added() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.bookings where date = new.date;
  return new;
end $$;
create trigger closures_cancel_bookings after insert on public.closures
  for each row execute function public.on_closure_added();

-- si alguien libera un día de su regla, se recuerda para no volver a reservarlo
create or replace function public.on_booking_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.recurring r where r.user_id = old.user_id
             and (extract(isodow from old.date)::int - 1) = any (r.days))
     and not exists (select 1 from public.closures c where c.date = old.date) then
    insert into public.recurring_skips (user_id, date) values (old.user_id, old.date) on conflict do nothing;
  end if;
  return old;
end $$;
create trigger bookings_remember_skip after delete on public.bookings
  for each row execute function public.on_booking_deleted();

-- crea las reservas de las reglas dentro del período de reserva.
-- Usa el puesto preferido; si está ocupado, otro libre de la misma zona; si no, cualquiera libre.
create or replace function public.materialize_recurring(only_user uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.office_config; r record; d date; pick text; made int := 0;
  first_day date := current_date;
  last_day date;
begin
  select * into cfg from public.office_config where id = 1;
  last_day := date_trunc('week', current_date)::date + cfg.horizon_weeks * 7 - 1;
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

-- cada persona puede aplicar su propia regla al guardarla
create or replace function public.apply_my_recurring() returns integer
language sql security definer set search_path = '' as $$
  select public.materialize_recurring((select auth.uid()));
$$;

revoke execute on function public.materialize_recurring(uuid) from public, anon, authenticated;
revoke execute on function public.apply_my_recurring() from public, anon;
grant execute on function public.apply_my_recurring() to authenticated;
revoke execute on function public.on_closure_added() from public, anon, authenticated;
revoke execute on function public.on_booking_deleted() from public, anon, authenticated;

create index recurring_skips_date_idx on public.recurring_skips (date);

alter publication supabase_realtime add table public.closures;

-- todos los días a las 00:15 (hora de Argentina) se completan las reservas recurrentes
create extension if not exists pg_cron;
select cron.schedule('alterna-recurring', '15 3 * * *', $$select public.materialize_recurring()$$);
