import { GoldText } from '@/components/ui';

/**
 * Brand logo: Đông Sơn bronze-drum SVG mark + "BEIKAO" wordmark.
 * The wordmark is the ONLY place Playfair Display is allowed (Latin text);
 * the tagline carries Vietnamese and stays in Be Vietnam Pro.
 */
export function BeikaoLogo() {
  return (
    <div className="bk-logo">
      <div className="bk-logo-mark">
        <svg viewBox="0 0 44 44" width="100%" height="100%">
          <circle cx="22" cy="22" r="20" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
          <circle cx="22" cy="22" r="15" fill="none" stroke="var(--gold)" strokeWidth="1" opacity=".6" />
          {Array.from({ length: 9 }).map((_, i) => (
            <path key={i} transform={`rotate(${i * 40} 22 22)`} d="M22 8 L23.6 18 L22 21 L20.4 18 Z" fill="var(--gold)" />
          ))}
          <circle cx="22" cy="22" r="3.4" fill="var(--gold)" />
        </svg>
      </div>
      <div className="bk-logo-word">
        <GoldText className="bk-logo-name">BEIKAO</GoldText>
        <span className="bk-logo-tag">三 張 · BÀI CÀO</span>
      </div>
    </div>
  );
}
