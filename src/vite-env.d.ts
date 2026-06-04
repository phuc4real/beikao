/// <reference types="vite/client" />

interface ImportMetaEnv {
  // No app-specific env vars: the Cloudflare backend is same-origin, so the
  // client derives the API/WS URLs from window.location (no VITE_* config).
  readonly _placeholder?: never;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
