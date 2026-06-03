/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase server-authoritative backend (the only backend; see TDD §19).
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
