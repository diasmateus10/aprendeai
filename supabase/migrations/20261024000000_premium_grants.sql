-- Premium given for free (early users, partners), apart from Stripe subscriptions.
-- Each account can see whether it has a grant; only the server/admin writes.
create table public.premium_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.premium_grants enable row level security;

create policy "Read own premium grant" on public.premium_grants
  for select to authenticated using ((select auth.uid()) = user_id);
