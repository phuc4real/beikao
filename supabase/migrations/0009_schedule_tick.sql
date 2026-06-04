-- 0009: schedule the betting-deadline tick (README §"Schedule the betting-deadline tick").
--
-- The server owns the clock: `tick` closes rooms whose betting window expired
-- and reaps empty/dead rooms — but nothing was invoking it, so a countdown
-- could hit zero with the round stuck in BETTING until the cái closed manually.
--
-- pg_cron + pg_net call the deployed function every 10 seconds. That cadence
-- keeps invocations well inside the free tier (~260K/month); the in-app
-- failsafe (the cái's client fires CLOSE_BETTING the moment its countdown
-- expires — see GameTable) covers the normal case instantly, so this cron is
-- the backstop for a disconnected cái plus the room reaper's heartbeat.
--
-- NOTE: the URL is this project's deployment (`tick` runs with
-- verify_jwt = false, so no key/header is needed). Adjust if you fork/relink.
-- `cron.schedule` with a fixed job name is idempotent: re-running replaces
-- the job. Applying this migration locally (supabase db reset) will tick the
-- HOSTED project from the local stack — harmless (the function is idempotent).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'beikao-tick',
  '10 seconds',
  $$
  select net.http_post(
    url := 'https://cdrixxivkuqvtiipttyq.supabase.co/functions/v1/tick',
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  )
  $$
);
