import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-amber-400 text-black hover:bg-amber-300 disabled:bg-amber-400/40 disabled:text-black/40',
  secondary: 'bg-felt-light text-white hover:bg-felt-light/80 disabled:opacity-40',
  ghost: 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-40',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:opacity-40',
};

/** Small inline spinner; inherits the button's text colour via `border-current`. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  loading = false,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  // The server round trip is ~1s+, so a `loading` button disables itself and
  // shows a spinner — instant feedback, and no accidental double-submits.
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition active:scale-95 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-black/20 p-4 ${className}`}>{children}</div>;
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-black/30 px-2.5 py-0.5 text-sm ${className}`}>
      {children}
    </span>
  );
}
