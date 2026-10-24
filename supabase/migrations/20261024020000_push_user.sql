-- Links a device's push subscription to the signed-in account, for notices about the account
-- (the free trial ending). Devices subscribed before this get linked on their next study day.
alter table public.push_subscriptions add column user_id uuid references auth.users (id) on delete cascade;
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
