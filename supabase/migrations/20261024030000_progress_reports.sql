-- Weekly progress reports (Premium): written by the report agent (trigger/reports.ts) from the week's
-- conversations, shown on the home screen. Learners read their own and mark them seen; only the server writes them.
create table public.progress_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  -- { headline, improved: [{ point, before, now }], focus: [{ point, tip, example }], next_goal, stats: {...} }
  report jsonb not null,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index progress_reports_user_recent on public.progress_reports (user_id, created_at desc);

alter table public.progress_reports enable row level security;

create policy "Read own reports" on public.progress_reports
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Mark own reports seen" on public.progress_reports
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Only the "seen" mark can change from the app.
revoke update on public.progress_reports from authenticated;
grant update (seen_at) on public.progress_reports to authenticated;
