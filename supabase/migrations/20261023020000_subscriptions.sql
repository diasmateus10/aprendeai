-- Premium subscription per account, mirrored from Stripe by the server (webhook and checkout return).
-- Learners can read their own row to unlock the app; only the server (secret key) writes.
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text,
  -- Stripe status: trialing, active, past_due, canceled, incomplete, unpaid...
  status text,
  plan text check (plan in ('monthly', 'yearly')),
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- The free trial is offered once per account.
  had_trial boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Read own subscription" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
