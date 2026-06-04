/* ============================================================
   BEIKAO — Win / Lose result overlay
   Exposes: window.ResultScreen
   ============================================================ */
function ResultScreen({ result, onAgain, onLobby }) {
  const won = result.youWon;
  const delta = won ? result.pot - result.you.stake : -result.you.stake;
  return (
    <div className="bk-stage result-screen">
      <div className="bk-motif motif-cloud"></div>
      {won && <div className="result-rays"></div>}
      <div className={`result-card panel panel-gilt ${won ? "win" : "lose"}`}>
        <div className="result-banner">
          <div className={`result-ribbon ${won?"win":"lose"}`}>
            {won ? "THẮNG LỚN" : "THUA CUỘC"}
          </div>
        </div>

        <h1 className={`result-title ${won?"":"lose"}`}>
          {won ? <span className="gold-text">Chúc mừng!</span> : <span>May mắn lần sau</span>}
        </h1>

        <div className="result-hand">
          {result.you.cards.map((c,i)=>(
            <Card key={c.id} card={c} faceDown={false} className={won?"glow":"dim"}
              style={{ marginLeft:i?"-30px":0, transform:`rotate(${(i-1)*7}deg)`, zIndex:i }} />
          ))}
        </div>

        <div className={`result-pts ${result.pts===9?"cao":""}`}>
          {result.you.pts===9 ? "CÀO CHÍN — 9 điểm" : `${result.you.pts} điểm`}
        </div>

        <div className="gold-rule result-rule">◆</div>

        <div className="result-stats">
          <div className="rstat">
            <span className="rstat-k">Người thắng</span>
            <span className="rstat-v">{result.winner.you ? "Bạn" : result.winner.name} · {result.pts} điểm</span>
          </div>
          <div className="rstat">
            <span className="rstat-k">Tổng cược</span>
            <span className="rstat-v gold-text">{result.pot.toLocaleString("vi-VN")}</span>
          </div>
          <div className="rstat">
            <span className="rstat-k">{won?"Bạn nhận":"Bạn mất"}</span>
            <span className={`rstat-v big ${won?"plus":"minus"}`}>
              {won?"+":""}{delta.toLocaleString("vi-VN")}
            </span>
          </div>
        </div>

        <div className="result-actions">
          <button className="btn btn-ghost" onClick={onLobby}>Về sảnh</button>
          <button className="btn btn-gold" onClick={onAgain}>Chơi tiếp →</button>
        </div>
      </div>
    </div>
  );
}
Object.assign(window, { ResultScreen });
