-- Phase 3 (3d) — durable cross-room chip balances.
-- A player's chip stack now persists in their profile and follows them between
-- rooms (instead of resetting to the room's starting balance each time). New
-- players are granted the room's starting balance on first join.

alter table public.profiles add column balance bigint not null default 0;

-- Seed/return a player's durable balance on join; creates the profile if new
-- (granting p_default). SECURITY DEFINER, service_role-only (server-side).
create or replace function public.get_or_create_profile(p_id text, p_name text, p_default bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare b bigint;
begin
  insert into public.profiles (id, name, balance) values (p_id, p_name, p_default)
  on conflict (id) do update set name = excluded.name
  returning balance into b;
  return b;
end;
$$;

revoke all on function public.get_or_create_profile(text, text, bigint) from public, anon, authenticated;
grant execute on function public.get_or_create_profile(text, text, bigint) to service_role;

-- Redefine the round recorder to also persist each player's post-settle balance.
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
    insert into public.profiles (id, name, balance, total_net, rounds_played, wins)
    values (r->>'id', r->>'name', (r->>'balance')::bigint, net, 1, case when net > 0 then 1 else 0 end)
    on conflict (id) do update set
      name          = excluded.name,
      balance       = excluded.balance,
      total_net     = public.profiles.total_net + net,
      rounds_played = public.profiles.rounds_played + 1,
      wins          = public.profiles.wins + (case when net > 0 then 1 else 0 end),
      updated_at    = now();
  end loop;
end;
$$;

revoke all on function public.record_round_result(jsonb) from public, anon, authenticated;
grant execute on function public.record_round_result(jsonb) to service_role;

-- Surface balance on the leaderboard too.
drop view public.leaderboard;
create view public.leaderboard as
  select id, name, total_net, balance, rounds_played, wins
  from public.profiles
  where rounds_played > 0
  order by total_net desc
  limit 50;
grant select on public.leaderboard to anon, authenticated;
