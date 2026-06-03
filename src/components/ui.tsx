import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-amber-400 text-black hover:bg-amber-300 disabled:bg-amber-400/40 disabled:text-black/40',
  secondary: 'bg-felt-light text-white hover:bg-felt-light/80 disabled:opacity-40',
  ghost: 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-40',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:opacity-40',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`rounded-xl px-5 py-3 text-base font-semibold transition active:scale-95 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
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
