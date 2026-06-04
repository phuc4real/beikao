-- 0011: wallet top-up ("rickroll tax") + once-a-day gift.
--
-- Chips are virtual ("chơi cho vui"), so the top-up is a joke feature: the
-- client opens a certain music video and the server credits +2000. The daily
-- gift credits +1000 at most once per VN-time calendar day, and ONLY when the
-- player explicitly claims it.
--
-- Security model (keeps the "clients never write results" invariant):
--   * SECURITY DEFINER so the functions can write `profiles` (which has no
--     client write policy).
--   * The target id is ALWAYS auth.uid() from the caller's JWT — never a
--     parameter — so a player can only credit their own wallet.
--   * EXECUTE is revoked from public/anon and granted to `authenticated`
--     (anonymous sign-ins get the authenticated role); a caller without a
--     session gets null.
--   * Both return null when the caller has no profile yet (profiles are
--     created server-side on first create/join) — the UI hides the buttons in
--     that case anyway.

alter table public.profiles add column if not exists last_gift_at date;
comment on column public.profiles.last_gift_at is 'VN-time date of the last claimed daily gift; null = never claimed.';

-- +2000 to the caller's own wallet. Unlimited — the price is the video.
create or replace function public.claim_topup()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance bigint;
begin
  if auth.uid() is null then return null; end if;
  update public.profiles
     set balance = balance + 2000, updated_at = now()
   where id = auth.uid()::text
  returning balance into new_balance;
  return new_balance; -- null: no profile yet (join a room first)
end;
$$;

revoke all on function public.claim_topup() from public, anon;
grant execute on function public.claim_topup() to authenticated;

-- +1000 once per VN-time day, claim-only (never auto-granted).
create or replace function public.claim_daily_gift()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  new_balance bigint;
begin
  if auth.uid() is null then return null; end if;
  update public.profiles
     set balance = balance + 1000, last_gift_at = today, updated_at = now()
   where id = auth.uid()::text
     and (last_gift_at is null or last_gift_at < today)
  returning balance into new_balance;
  return new_balance; -- null: already claimed today, or no profile yet
end;
$$;

revoke all on function public.claim_daily_gift() from public, anon;
grant execute on function public.claim_daily_gift() to authenticated;
