/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
  readonly VITE_METERED_URL?: string;
  readonly VITE_METERED_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
