-- 0010: remove the leaderboard (UI dropped for a lighter app).
--
-- What goes: the public `leaderboard` view (0003, redefined in 0004) and its
-- supporting partial index (0006) — nothing reads them anymore. The Home
-- wallet now reads own `profiles.balance` directly via the existing
-- `profiles_read` policy.
--
-- What STAYS (do not remove): `profiles` + `record_round_result` — the server
-- writes each settled round's post-settle balance there, which is what makes
-- chips follow the player between rooms (durable balances, 3d). The stats
-- columns (total_net/rounds_played/wins) keep accruing at zero extra cost and
-- leave the door open to bring a leaderboard back later.

drop view if exists public.leaderboard;
drop index if exists public.profiles_leaderboard_idx;
