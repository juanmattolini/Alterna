-- Viandas: cada persona con reserva elige su menú del día y cualquiera envía el pedido al proveedor

alter table public.office_config
  add column meal_cutoff time not null default '08:30',
  add column meal_emails text not null default 'pedidos@gastrosud.com.ar; administracion@gastrosud.com.ar';

create table public.meal_orders (
  date date not null,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  menu text not null check (length(menu) between 1 and 20),
  menu_other text not null default '' check (length(menu_other) <= 120),
  drink text not null default '' check (length(drink) <= 40),
  updated_at timestamptz not null default now(),
  primary key (date, user_id)
);

-- one row per day once someone sent the order; it locks that day's choices
create table public.meal_sends (
  date date primary key,
  sent_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  orders smallint not null default 0
);

-- choices need a booking that day, close at the cutoff (Buenos Aires time) and once the order went out
create or replace function public.check_meal_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cut time; d date;
begin
  -- cascades (a deleted user) must always go through
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  d := case when tg_op = 'DELETE' then old.date else new.date end;
  select meal_cutoff into cut from public.office_config where id = 1;
  if (now() at time zone 'America/Argentina/Buenos_Aires') >= d + cut then
    raise exception 'Ya cerró la elección de viandas de ese día'; end if;
  if exists (select 1 from public.meal_sends where date = d) then
    raise exception 'El pedido de ese día ya se envió'; end if;
  if tg_op <> 'DELETE' then
    if not exists (select 1 from public.bookings where date = new.date and user_id = new.user_id) then
      raise exception 'Necesitás una reserva ese día para pedir vianda'; end if;
    if new.menu = 'OTRA' and btrim(new.menu_other) = '' then
      raise exception 'Contanos qué querés en Otras'; end if;
    new.updated_at := now();
    return new;
  end if;
  return old;
end $$;
create trigger meal_orders_check before insert or update or delete on public.meal_orders
  for each row execute function public.check_meal_order();

alter table public.meal_orders enable row level security;
alter table public.meal_sends enable row level security;

-- everyone sees the day's list, because anyone can send it
create policy "meal read" on public.meal_orders for select to authenticated using (true);
create policy "meal insert own" on public.meal_orders for insert to authenticated with check (user_id = (select auth.uid()));
create policy "meal update own" on public.meal_orders for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meal delete own" on public.meal_orders for delete to authenticated using (user_id = (select auth.uid()));

create policy "meal sends read" on public.meal_sends for select to authenticated using (true);
create policy "meal sends insert" on public.meal_sends for insert to authenticated with check (sent_by = (select auth.uid()));
create policy "meal sends undo by sender or admin" on public.meal_sends for delete to authenticated
  using (sent_by = (select auth.uid()) or (select public.is_admin()));

create index meal_orders_user_idx on public.meal_orders (user_id);
create index meal_sends_sent_by_idx on public.meal_sends (sent_by);

revoke execute on function public.check_meal_order() from public, anon, authenticated;

alter publication supabase_realtime add table public.meal_orders, public.meal_sends;
