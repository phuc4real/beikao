/**
 * Atmospheric "Lacquer & Gold" backdrop: lacquer radial gradient + grain +
 * vignette + a repeating Vietnamese motif tile.
 *
 * Rendered as a fixed full-viewport layer behind the page (z-index −10), so
 * scrolling content is unaffected — unlike the prototype's overflow:hidden
 * screens. Mount once per page: fret for menus, cloud for in-game.
 */
export function Stage({ motif = 'fret' }: { motif?: 'fret' | 'cloud' }) {
  return (
    <div className="bk-stage" aria-hidden>
      <div className={`bk-motif motif-${motif}`} />
    </div>
  );
}
