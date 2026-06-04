import { useEffect, useState, type ReactNode } from 'react';

/**
 * Crossfades its children whenever `token` changes: the outgoing content fades
 * out (absolutely positioned) while the incoming fades in, so room.status
 * transitions (LOBBY ⇄ BETTING ⇄ REVEAL) glide instead of hard-cutting — one
 * more beat that masks the ~1s `intent` round trip behind each transition.
 *
 * Presentation-only. The leaving snapshot is the content captured when we
 * entered the previous phase (good enough — it's on its way out), and both
 * layers collapse to the end state instantly under `prefers-reduced-motion`.
 */
export function PhaseSwap({
  token,
  className = '',
  children,
}: {
  token: string;
  className?: string;
  children: ReactNode;
}) {
  const [prev, setPrev] = useState<{ token: string; node: ReactNode }>({ token, node: children });
  const [leaving, setLeaving] = useState<ReactNode>(null);

  // React-supported "derive state during render": guarded by token so it can't
  // loop (children change identity every render, but token does not).
  if (prev.token !== token) {
    setLeaving(prev.node);
    setPrev({ token, node: children });
  }

  useEffect(() => {
    if (leaving == null) return;
    const t = setTimeout(() => setLeaving(null), 280);
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    <div className={`phase-swap ${className}`}>
      {leaving != null && leaving !== false && (
        <div key="phase-leave" className="phase-swap-leave" aria-hidden>
          {leaving}
        </div>
      )}
      <div key={token} className="phase-swap-enter">
        {children}
      </div>
    </div>
  );
}
