-- Daily study reminders (push notifications, adult mode) and per-person daily usage limits.
-- Only the server touches these tables, with the secret key: RLS is on and there are no policies,
-- so the public (publishable/anon) key can't read or change anything.

-- One row per device that turned reminders on. No personal data: the endpoint is an opaque
-- push-service URL, and the server only knows the last day the learner studied.
create table public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  last_study_day date,
  streak integer not null default 0,
  last_notified_day date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Daily counters for the AI chat and the voice, so a public link can't burn the API credits.
-- `client` is a keyed hash of the IP address, never the address itself.
create table public.api_usage (
  client text not null,
  day date not null,
  kind text not null,
  count integer not null default 0,
  primary key (client, day, kind)
);

alter table public.api_usage enable row level security;

-- Counts one use and says whether it is still within the limit, atomically.
create function public.use_quota(p_client text, p_day date, p_kind text, p_limit integer)
returns boolean
language sql
set search_path = ''
as $$
  insert into public.api_usage as u (client, day, kind, count)
  values (p_client, p_day, p_kind, 1)
  on conflict (client, day, kind) do update set count = u.count + 1
  returning u.count <= p_limit;
$$;

revoke execute on function public.use_quota(text, date, text, integer) from public, anon, authenticated;
grant execute on function public.use_quota(text, date, text, integer) to service_role;
