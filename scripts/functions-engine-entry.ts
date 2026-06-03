// Entry point bundled into supabase/functions/_shared/engine.bundle.js by
// scripts/build-functions.mjs. Re-exports exactly what the Edge Functions need
// so the Bài cào rules are reused verbatim (no fork) and Deno imports a single,
// extensionless-free ESM module. See TDD §19.2 and supabase/README.md.
export { GameAuthority } from '@/features/room/authority';
export { intentionSchema } from '@/network/protocol/messages';
export { DEFAULT_CONFIG } from '@/features/room/types';
