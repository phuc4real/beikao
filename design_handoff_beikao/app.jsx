/* ============================================================
   BEIKAO — App router + Tweaks
   ============================================================ */
const { useState: useAppState } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "round",
  "seats": 6,
  "cardBack": "drum",
  "chipStyle": "classic"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useAppState("lobby"); // lobby | table | result
  const [room, setRoom] = useAppState(null);
  const [result, setResult] = useAppState(null);
  const [balance] = useAppState(2480000);
  const [tableKey, setTableKey] = useAppState(0);

  function join(r) { setRoom(r); setScreen("table"); }
  function onResult(res) { setResult(res); setScreen("result"); }
  function again() { setResult(null); setTableKey(k=>k+1); setScreen("table"); }
  function lobby() { setScreen("lobby"); setRoom(null); }

  return (
    <>
      {screen === "lobby" && <Lobby onJoin={join} balance={balance} />}
      {screen === "table" && <GameTable key={tableKey} room={room} onResult={onResult} onLeave={lobby} tweaks={t} />}
      {screen === "result" && <ResultScreen result={result} onAgain={again} onLobby={lobby} />}

      <TweaksPanel>
        <TweakSection label="Bàn chơi" />
        <TweakRadio label="Bố cục bàn" value={t.layout} options={["round","arc","compact"]}
          onChange={v=>setTweak("layout", v)} />
        <TweakSlider label="Số ghế" value={t.seats} min={2} max={16} step={1} unit=" ghế"
          onChange={v=>setTweak("seats", v)} />
        <TweakSection label="Lá bài" />
        <TweakRadio label="Mặt sau bài" value={t.cardBack} options={["drum","phoenix","lotus"]}
          onChange={v=>setTweak("cardBack", v)} />
        <TweakSection label="Cược" />
        <TweakRadio label="Kiểu chip" value={t.chipStyle} options={["classic","gold","jade"]}
          onChange={v=>setTweak("chipStyle", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
