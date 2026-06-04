import { useEffect } from 'react';
import { useGame } from '@/app/store/store';

export function Toast() {
  const notice = useGame((s) => s.notice);
  const clearNotice = useGame((s) => s.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 3000);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  if (!notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="animate-pop rounded-xl border border-red-400/40 bg-gradient-to-br from-[#8e1f26] to-[#4a0a10] px-4 py-2 text-sm font-medium text-red-100 shadow-soft">
        {notice}
      </div>
    </div>
  );
}
