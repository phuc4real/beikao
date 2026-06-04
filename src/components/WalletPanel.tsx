import { useEffect, useState } from 'react';
import { Button, Coin, GoldText, Panel } from '@/components/ui';
import { peekIdentity } from '@/network/cf/auth';
import { claimDailyGift, claimTopup, fetchWallet, type Wallet } from '@/network/cf/profile';
import { formatChips } from '@/utils/money';

/** Today (YYYY-MM-DD) in VN time — mirrors the server's gift-day boundary. */
function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/**
 * Home wallet: durable balance + the two joke economy taps. "Nạp chip" opens
 * the, ahem, payment gateway (a certain music video) and credits +2000; the
 * daily gift credits +1000 once per VN day and ONLY on an explicit claim.
 * Both credits happen server-side (`claim_topup`/`claim_daily_gift` RPCs keyed
 * to auth.uid()) — the client never writes a balance. Hidden until the player
 * has a profile (created on their first create/join).
 */
export function WalletPanel() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [flash, setFlash] = useState<{ amount: number; at: number } | null>(null);
  const [showTopup, setShowTopup] = useState(false);
  const [topupOk, setTopupOk] = useState(false);
  const [giftBusy, setGiftBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void peekIdentity()
      .then((id) => (id ? fetchWallet(id) : null))
      .then((w) => {
        if (active) setWallet(w);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!wallet) return null; // no profile yet — chips arrive on the first join

  const credited = (balance: number, amount: number, extra?: Partial<Wallet>) => {
    setWallet({ ...wallet, ...extra, balance });
    setFlash({ amount, at: performance.now() });
    setTimeout(() => setFlash(null), 2200);
  };

  const giftClaimed = wallet.lastGiftAt === vnToday();
  const claimGift = async () => {
    setGiftBusy(true);
    const b = await claimDailyGift();
    setGiftBusy(false);
    if (b != null) credited(b, 1000, { lastGiftAt: vnToday() });
    // null = the server says it's already claimed today — sync the button.
    else setWallet({ ...wallet, lastGiftAt: vnToday() });
  };

  const openTopup = async () => {
    setShowTopup(true); // the video IS the payment
    setTopupOk(false);
    const b = await claimTopup();
    if (b != null) {
      credited(b, 2000);
      setTopupOk(true);
    }
  };

  return (
    <>
      <Panel className="flex items-center gap-3 !p-2 !pl-3.5">
        <Coin />
        <div className="relative pr-1">
          <div className="text-[10px] uppercase tracking-wider text-pearl/55">Số dư</div>
          <GoldText className="font-display text-lg font-extrabold leading-none">
            {formatChips(wallet.balance)}
          </GoldText>
          {flash && (
            <span key={flash.at} className="balance-flash up" aria-hidden>
              +{formatChips(flash.amount)}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button className="btn-gold rounded-lg px-2.5 py-1 text-xs font-bold" onClick={() => void openTopup()}>
            ＋ Nạp chip
          </button>
          <button
            className="btn-ghost rounded-lg px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => void claimGift()}
            disabled={giftClaimed || giftBusy}
          >
            {giftClaimed ? '✓ Đã nhận quà hôm nay' : '🎁 Quà ngày +1.000'}
          </button>
        </div>
      </Panel>

      {showTopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowTopup(false)}
        >
          <div className="panel panel-gilt w-full max-w-lg space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                <GoldText>Cổng nạp chip chính hãng</GoldText>
              </h2>
              <button className="btn-ghost h-8 w-8 rounded-full" onClick={() => setShowTopup(false)} aria-label="Đóng">
                ✕
              </button>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-gold/30">
              <iframe
                className="h-full w-full"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
                title="Cổng nạp chip"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
            <p className="text-center text-sm text-pearl/70">
              {topupOk ? (
                <>
                  ＋<GoldText className="font-bold">2.000</GoldText> chip đã vào ví 🎉 — giá nạp: một bài hát.
                </>
              ) : (
                'Đang xử lý giao dịch…'
              )}
            </p>
            <Button className="w-full" onClick={() => setShowTopup(false)}>
              Nhận chip & đóng
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
