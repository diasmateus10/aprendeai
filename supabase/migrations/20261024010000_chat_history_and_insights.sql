-- Voice conversations with the AI (adult mode), kept so an agent can learn what each learner struggles with.
-- Learners can read their own; only the server writes.
create table public.chat_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  level text,
  -- [{ "role": "user" | "assistant", "content": "..." }], in order
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  user_turns integer not null default 0,
  -- Feedback shown at the end of the conversation (Portuguese).
  feedback text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create index chat_sessions_user_recent on public.chat_sessions (user_id, started_at desc);

alter table public.chat_sessions enable row level security;

create policy "Read own conversations" on public.chat_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

-- What each learner finds hardest, rewritten by the insights agent after every conversation and
-- given to the AI partner at the start of the next one.
create table public.learner_insights (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Short summary of the learner's English, in Portuguese.
  summary text not null,
  -- [{ "area": "...", "evidence": ["frase dita → frase certa"], "tip": "..." }]
  weak_points jsonb not null default '[]'::jsonb,
  -- What the next conversation should practice, in English (for the AI partner).
  next_focus text,
  sessions_analyzed integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.learner_insights enable row level security;

create policy "Read own insights" on public.learner_insights
  for select to authenticated using ((select auth.uid()) = user_id);
