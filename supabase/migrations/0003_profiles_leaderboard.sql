-- Phase 3 (3d) — durable player stats + leaderboard.
-- The in-room chip economy stays per-room (balances reset when a room closes).
-- Separately, the server records each settled round's per-player net into a
-- durable `profiles` row (keyed by the stable player id), powering a public
-- leaderboard. Only the Edge Function (service_role) may write — clients can't
-- inflate their own stats.

create table public.profiles (
  id            text primary key,          -- stable player id (localStorage; Supabase Auth uid later)
  name          text,
  total_net     bigint  not null default 0, -- cumulative chip net across all rounds (can be negative)
  rounds_played integer not null default 0,
  wins          integer not null default 0, -- rounds with a positive net
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Public read (for the leaderboard); writes are service_role only (no policy).
create policy profiles_read on public.profiles
  for select to anon, authenticated using (true);

-- Top players by net winnings (only those who've actually played).
create view public.leaderboard as
  select id, name, total_net, rounds_played, wins
  from public.profiles
  where rounds_played > 0
  order by total_net desc
  limit 50;

grant select on public.leaderboard to anon, authenticated;

-- Atomic upsert+increment for a finished round. SECURITY DEFINER so the Edge
-- Function can call it, but execute is NOT granted to anon — only the server
-- (service_role) records results, so stats can't be forged from the client.
create or replace function public.record_round_result(results jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  net bigint;
begin
  for r in select * from jsonb_array_elements(results) loop
    net := (r->>'net')::bigint;
    insert into public.profiles (id, name, total_net, rounds_played, wins)
    values (r->>'id', r->>'name', net, 1, case when net > 0 then 1 else 0 end)
    on conflict (id) do update set
      name          = excluded.name,
      total_net     = public.profiles.total_net + excluded.total_net,
      rounds_played = public.profiles.rounds_played + 1,
      wins          = public.profiles.wins + (case when net > 0 then 1 else 0 end),
      updated_at    = now();
  end loop;
end;
$$;

revoke all on function public.record_round_result(jsonb) from public, anon, authenticated;
grant execute on function public.record_round_result(jsonb) to service_role;

comment on view public.leaderboard is 'Top players by cumulative net winnings (§3d). Public read-only.';
