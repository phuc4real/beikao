import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

// Visual treatments (gradients, inset shadows) live in styles/theme.css;
// Tailwind handles layout + states here.
const VARIANTS: Record<Variant, string> = {
  primary: 'btn-gold',
  secondary: 'btn-jade',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-50 ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Panel({
  children,
  className = '',
  gilt = false,
}: {
  children: ReactNode;
  className?: string;
  /** Adds the inset double gold border of the prototype's `.panel-gilt`. */
  gilt?: boolean;
}) {
  return <div className={`panel ${gilt ? 'panel-gilt' : ''} p-4 ${className}`}>{children}</div>;
}

export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`pill inline-flex items-center rounded-full px-2.5 py-0.5 text-sm ${className}`}>
      {children}
    </span>
  );
}

/** Gold-gradient clipped text (the design's `.gold-text`). */
export function GoldText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`gold-text ${className}`}>{children}</span>;
}

/** Hairline gold divider with a center ornament (default ◆). */
export function GoldRule({ children = '◆', className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`gold-rule text-xs ${className}`} aria-hidden>
      {children}
    </div>
  );
}

/** Gold coin disc with the ₫ glyph (wallet / balance ornament). */
export function Coin({ small = false, className = '' }: { small?: boolean; className?: string }) {
  return (
    <span aria-hidden className={`coin ${small ? 'coin-sm' : ''} ${className}`}>
      ₫
    </span>
  );
}
