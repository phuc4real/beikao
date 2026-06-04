/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  // `supabase/` holds Deno Edge Functions (npm:/jsr: imports, Deno globals) —
  // linted/typechecked by the Supabase CLi (deno), not this app's ESLint/tsc.
  // `cloudflare/` holds the Worker + Durable Objects (Workers runtime globals,
  // @cloudflare/workers-types) — typechecked by `npm run cf:typecheck` instead.
  ignorePatterns: ['dist', 'node_modules', '*.config.js', '*.config.ts', 'supabase', 'scripts', 'cloudflare'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
