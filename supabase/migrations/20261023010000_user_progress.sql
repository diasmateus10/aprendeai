-- Each account's whole progress (adult course, Kids mode, settings) as one JSON document,
-- readable and writable only by its owner.
create table public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) < 500000),
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

create policy "Read own progress" on public.user_progress
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Create own progress" on public.user_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Update own progress" on public.user_progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
