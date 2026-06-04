import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/app/store/store';

export function Chat({ className = '' }: { className?: string }) {
  const chat = useGame((s) => s.room?.chat ?? []);
  const sendChat = useGame((s) => s.sendChat);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    sendChat(t);
    setText('');
  };

  return (
    <div className={`panel flex flex-col ${className}`}>
      <div className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {chat.length === 0 && <p className="text-pearl/30">Chưa có tin nhắn…</p>}
        {chat.map((m) => (
          <p key={m.id}>
            <span className="font-semibold text-gold">{m.name}: </span>
            <span className="text-pearl/90">{m.text}</span>
          </p>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 border-t border-gold/15 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          maxLength={200}
          placeholder="Nhắn tin…"
          className="lq-input flex-1 px-3 py-2 text-sm"
        />
        <button onClick={submit} className="btn-ghost rounded-lg px-3 text-sm font-semibold">
          Gửi
        </button>
      </div>
    </div>
  );
}
