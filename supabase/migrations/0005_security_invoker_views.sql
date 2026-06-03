-- Phase 3 — security hardening: make the public views SECURITY INVOKER.
--
-- Postgres views default to `security_invoker = off`, meaning they run with the
-- *view owner's* privileges and bypass the *querying* user's RLS. Supabase's
-- security advisor flags this ("Security Definer View"): a future tightening of
-- a base table's RLS would silently NOT apply to rows read through the view.
--
-- Setting `security_invoker = on` makes each view enforce the RLS/permissions of
-- the caller (anon / authenticated) instead. This is a no-op for what's visible
-- today — both base tables already grant anon/authenticated SELECT over exactly
-- these columns:
--   * leaderboard      → profiles   (policy profiles_read   USING (true))
--   * room_directory   → rooms      (policy rooms_read_anon USING (true))
-- but it removes the RLS-bypass and makes future base-table policy changes
-- authoritative through the views too.
--
-- Requires Postgres 15+ (the `security_invoker` view option). Supabase projects
-- run PG15+, so this is safe.

alter view public.leaderboard    set (security_invoker = on);
alter view public.room_directory set (security_invoker = on);
