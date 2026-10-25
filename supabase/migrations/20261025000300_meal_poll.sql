-- Votación: ¿pedimos las viandas desde la app en lugar del formulario?
create table public.meal_poll_votes (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  vote boolean not null,
  updated_at timestamptz not null default now()
);
alter table public.meal_poll_votes enable row level security;
create policy "poll read" on public.meal_poll_votes for select to authenticated using (true);
create policy "poll insert own" on public.meal_poll_votes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "poll update own" on public.meal_poll_votes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "poll delete own" on public.meal_poll_votes for delete to authenticated using (user_id = (select auth.uid()));
alter publication supabase_realtime add table public.meal_poll_votes;
