-- Alterna: reserva de puestos para el esquema híbrido 3+2

create table public.office_config (
  id smallint primary key default 1 check (id = 1),
  office_days smallint not null default 3 check (office_days between 1 and 5),
  horizon_weeks smallint not null default 3 check (horizon_weeks between 1 and 8),
  off_anchor text not null default 'allow' check (off_anchor in ('allow','block')),
  updated_at timestamptz not null default now()
);
insert into public.office_config (id) values (1);

create table public.zones (
  id text primary key check (id ~ '^[A-Z0-9]{1,3}$'),
  name text not null,
  desks smallint not null default 0 check (desks between 0 and 200),
  off_desks smallint[] not null default '{}',
  sort smallint not null default 0
);
insert into public.zones (id, name, desks, sort) values
  ('N','Zona Norte',16,1), ('S','Zona Sur',16,2), ('Q','Sala silenciosa',8,3);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  people smallint not null default 0 check (people >= 0),
  days smallint[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  team_id uuid references public.teams(id) on delete set null,
  role text not null default 'member' check (role in ('member','admin')),
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  desk_id text not null,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (date, desk_id),
  unique (date, user_id)
);
create index bookings_date_idx on public.bookings (date);
create index bookings_user_idx on public.bookings (user_id);
create index profiles_team_idx on public.profiles (team_id);

-- helpers
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

-- new users get a profile; the very first user becomes admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
          case when exists (select 1 from public.profiles) then 'member' else 'admin' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- members cannot promote themselves
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_role();

-- bookings must fall on a weekday inside the booking window
create or replace function public.check_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cfg public.office_config;
begin
  select * into cfg from public.office_config where id = 1;
  if extract(isodow from new.date) > 5 then raise exception 'Solo se reserva de lunes a viernes'; end if;
  if new.date < current_date then raise exception 'No se puede reservar un día pasado'; end if;
  if new.date >= date_trunc('week', current_date)::date + cfg.horizon_weeks * 7 then
    raise exception 'Fuera del período de reserva'; end if;
  return new;
end $$;
create trigger bookings_check before insert on public.bookings
  for each row execute function public.check_booking();

-- RLS
alter table public.office_config enable row level security;
alter table public.zones enable row level security;
alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.bookings enable row level security;

create policy "config read" on public.office_config for select to authenticated using (true);
create policy "config admin update" on public.office_config for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "zones read" on public.zones for select to authenticated using (true);
create policy "zones admin insert" on public.zones for insert to authenticated with check ((select public.is_admin()));
create policy "zones admin update" on public.zones for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "zones admin delete" on public.zones for delete to authenticated using ((select public.is_admin()));

create policy "teams read" on public.teams for select to authenticated using (true);
create policy "teams admin insert" on public.teams for insert to authenticated with check ((select public.is_admin()));
create policy "teams admin update" on public.teams for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "teams admin delete" on public.teams for delete to authenticated using ((select public.is_admin()));

create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update own or admin" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

create policy "bookings read" on public.bookings for select to authenticated using (true);
create policy "bookings insert own" on public.bookings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "bookings delete own or admin" on public.bookings for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_role() from public, anon, authenticated;
revoke execute on function public.check_booking() from public, anon, authenticated;

-- live updates
alter publication supabase_realtime add table public.bookings, public.teams, public.zones, public.office_config;
