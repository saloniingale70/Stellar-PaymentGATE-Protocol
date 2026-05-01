import { useState, useCallback } from "react";
import * as FreighterApi from "@stellar/freighter-api";
import * as StellarSdk from "@stellar/stellar-sdk";

const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID;
const RPC_URL = import.meta.env.VITE_RPC_URL;
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE;
const XLM_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";
const CONTRACT_EXPLORER_URL = `${EXPLORER_BASE}/contract/${CONTRACT_ID}`;
const txExplorerUrl = (hash) => `${EXPLORER_BASE}/tx/${hash}`;

const rpc = new StellarSdk.rpc.Server(RPC_URL);

function fmt(val) { return (Number(val) / 1e7).toFixed(2); }
function shortAddr(addr) { if (!addr) return ""; return addr.slice(0, 6) + "…" + addr.slice(-4); }
function shortContract(id) { if (!id) return ""; return id.slice(0, 8) + "…" + id.slice(-6); }

const IcoLock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IcoSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const IcoSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IcoTick = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IcoClose = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IcoLink = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const IcoSpin = () => (
  <svg className="rotating" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);
const IcoWallet = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 3H8l-2 4h12l-2-4z"/><circle cx="17" cy="14" r="1" fill="currentColor"/>
  </svg>
);
const IcoShield = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IcoArrow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

// ── Notification ──────────────────────────────────────────────────────────────
function Notification({ items }) {
  return (
    <div className="notif-area">
      {items.map(n => (
        <div key={n.id} className={`notif notif--${n.kind}`}>
          <span className="notif-icon">{n.kind === "ok" ? <IcoTick /> : <IcoClose />}</span>
          <span className="notif-text">{n.msg}</span>
          {n.txHash && (
            <a href={txExplorerUrl(n.txHash)} target="_blank" rel="noopener noreferrer" className="notif-cta">
              View Tx <IcoLink />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}


export default function App() {
  const [view, setView] = useState("new");
  const [walletAddr, setWalletAddr] = useState(null);
  const [notices, setNotices] = useState([]);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    dealId: "", depositor: "", beneficiary: "", asset: XLM_TOKEN, amount: "", checkpoints: "3",
  });
  const [lookupId, setLookupId] = useState("");
  const [dealData, setDealData] = useState(null);
  const [cpIndex, setCpIndex] = useState("");
  const [withdrawId, setWithdrawId] = useState("");
  const [voidId, setVoidId] = useState("");

  const notify = useCallback((msg, kind = "ok", txHash = null) => {
    const id = Date.now();
    setNotices(n => [...n, { id, msg, kind, txHash }]);
    setTimeout(() => setNotices(n => n.filter(x => x.id !== id)), 6000);
  }, []);

  async function connectWallet() {
    try {
      if (FreighterApi && typeof FreighterApi.isConnected === "function") {
        const chk = await FreighterApi.isConnected();
        if (!chk?.isConnected) { notify("Freighter not unlocked — open the extension", "err"); return; }
        await FreighterApi.requestAccess();
        const { address } = await FreighterApi.getAddress();
        if (!address) throw new Error("No address returned");
        setWalletAddr(address);
        setForm(f => ({ ...f, depositor: address }));
        notify("Wallet connected");
        return;
      }
      let tries = 0;
      while (!window.freighter && tries < 20) { await new Promise(r => setTimeout(r, 150)); tries++; }
      if (!window.freighter) { notify("Freighter extension not found", "err"); return; }
      if (typeof window.freighter.requestAccess === "function") await window.freighter.requestAccess();
      const res = await (window.freighter.getAddress?.() ?? window.freighter.getPublicKey?.());
      const address = res?.address ?? res;
      if (!address) throw new Error("No address returned");
      setWalletAddr(address);
      setForm(f => ({ ...f, depositor: address }));
      notify("Wallet connected");
    } catch (e) { notify(e.message || String(e), "err"); }
  }

  async function invoke(op) {
    if (!walletAddr) { notify("Connect your wallet first", "err"); return null; }
    setBusy(true);
    try {
      const account = await rpc.getAccount(walletAddr);
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      }).addOperation(op).setTimeout(30).build();

      const sim = await rpc.simulateTransaction(tx);
      if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
      const assembled = StellarSdk.rpc.assembleTransaction(tx, sim).build();

      let signedXdr;
      if (FreighterApi && typeof FreighterApi.signTransaction === "function") {
        const r = await FreighterApi.signTransaction(assembled.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE, network: "TESTNET" });
        signedXdr = r?.signedTxXdr ?? r;
      } else {
        const r = await window.freighter.signTransaction(assembled.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE, network: "TESTNET" });
        signedXdr = typeof r === "string" ? r : r.signedTxXdr;
      }

      const signed = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
      const result = await rpc.sendTransaction(signed);
      const txHash = result.hash;

      let status = result;
      while (status.status === "PENDING" || status.status === "NOT_FOUND") {
        await new Promise(r => setTimeout(r, 1500));
        status = await rpc.getTransaction(txHash);
      }

      if (status.status === "SUCCESS") {
        notify("Transaction confirmed", "ok", txHash);
        return { status, hash: txHash };
      } else {
        throw new Error("Transaction failed: " + status.status);
      }
    } catch (e) {
      notify(e.message || String(e), "err");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const gate = new StellarSdk.Contract(CONTRACT_ID);

  async function openDeal() {
    const { dealId, depositor, beneficiary, asset, amount, checkpoints } = form;
    if (!dealId || !depositor || !beneficiary || !asset || !amount || !checkpoints) {
      notify("Please fill in all fields", "err"); return;
    }
    const op = gate.call(
      "open_deal",
      StellarSdk.nativeToScVal(dealId, { type: "symbol" }),
      new StellarSdk.Address(depositor).toScVal(),
      new StellarSdk.Address(beneficiary).toScVal(),
      new StellarSdk.Address(asset).toScVal(),
      StellarSdk.nativeToScVal(BigInt(Math.round(parseFloat(amount) * 1e7)), { type: "i128" }),
      StellarSdk.nativeToScVal(parseInt(checkpoints), { type: "u32" }),
    );
    await invoke(op);
  }

  async function approveCheckpoint() {
    if (!lookupId || cpIndex === "") { notify("Provide deal ID and checkpoint index", "err"); return; }
    const op = gate.call(
      "approve_checkpoint",
      StellarSdk.nativeToScVal(lookupId, { type: "symbol" }),
      StellarSdk.nativeToScVal(parseInt(cpIndex), { type: "u32" }),
    );
    await invoke(op);
    await loadDeal(lookupId);
  }

  async function withdraw() {
    if (!withdrawId) { notify("Provide deal ID", "err"); return; }
    const op = gate.call("withdraw", StellarSdk.nativeToScVal(withdrawId, { type: "symbol" }));
    await invoke(op);
  }

  async function voidDeal() {
    if (!voidId) { notify("Provide deal ID", "err"); return; }
    const op = gate.call("void_deal", StellarSdk.nativeToScVal(voidId, { type: "symbol" }));
    await invoke(op);
  }

  async function loadDeal(id) {
    if (!id) { notify("Enter deal ID", "err"); return; }
    setBusy(true);
    try {
      const account = await rpc.getAccount(walletAddr || StellarSdk.Keypair.random().publicKey());
      const op = gate.call("get_deal", StellarSdk.nativeToScVal(id, { type: "symbol" }));
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      }).addOperation(op).setTimeout(30).build();

      const sim = await rpc.simulateTransaction(tx);
      if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error);

      const retVal = sim.result?.retval;
      if (!retVal) throw new Error("Empty result");

      setDealData(StellarSdk.scValToNative(retVal));
      notify("Deal loaded");
    } catch (e) {
      notify(e.message || String(e), "err");
      setDealData(null);
    } finally {
      setBusy(false);
    }
  }

  const approvedCount = dealData?.checkpoints?.filter(Boolean).length ?? 0;
  const totalCp = dealData?.checkpoints?.length ?? 0;
  const pct = totalCp ? Math.round((approvedCount / totalCp) * 100) : 0;

  const navItems = [
    { key: "new", label: "New Deal", icon: "✦" },
    { key: "track", label: "Track", icon: "◎" },
    { key: "withdraw", label: "Withdraw", icon: "↑" },
    { key: "void", label: "Void", icon: "✕" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #0a0b0d;
          --bg1: #0f1114;
          --bg2: #141619;
          --bg3: #1a1d22;
          --bg4: #202530;
          --line: #ffffff0d;
          --line2: #ffffff18;
          --line3: #ffffff28;
          --ink: #f0ede8;
          --ink2: #a09890;
          --ink3: #6a6460;
          --gold: #c9a84c;
          --gold2: #e8c96a;
          --gold-dim: #c9a84c14;
          --gold-glow: #c9a84c30;
          --teal: #2dd4bf;
          --teal-dim: #2dd4bf12;
          --red: #f87171;
          --red-dim: #f8717114;
          --green: #4ade80;
          --green-dim: #4ade8012;
          --serif: 'Sora', sans-serif;
          --sans: 'Space Grotesk', sans-serif;
          --mono: 'Space Mono', monospace;
          --r: 6px;
          --r-lg: 12px;
          --r-xl: 18px;
        }

        body {
          background: var(--bg);
          color: var(--ink);
          font-family: var(--sans);
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }

        /* ambient background */
        body::before {
          content: '';
          position: fixed;
          top: -40%;
          left: 50%;
          transform: translateX(-50%);
          width: 900px;
          height: 600px;
          background: radial-gradient(ellipse at center, #c9a84c08 0%, transparent 65%);
          pointer-events: none;
          z-index: 0;
        }

        .shell {
          position: relative;
          z-index: 1;
          max-width: 800px;
          margin: 0 auto;
          padding: 32px 20px 100px;
        }

        /* ── masthead ── */
        .masthead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 28px;
          margin-bottom: 28px;
          border-bottom: 1px solid var(--line2);
          gap: 16px;
          flex-wrap: wrap;
        }

        .brand-lockup {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .brand-icon {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: linear-gradient(135deg, #c9a84c22, #c9a84c08);
          border: 1px solid var(--gold)44;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--gold);
        }

        .brand-text {}
        .brand-name {
          font-family: var(--serif);
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: -.02em;
          line-height: 1;
        }
        .brand-tagline {
          font-size: .68rem;
          color: var(--ink3);
          margin-top: 3px;
          letter-spacing: .04em;
        }

        .masthead-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .net-badge {
          font-family: var(--mono);
          font-size: .6rem;
          background: var(--gold-dim);
          border: 1px solid var(--gold)44;
          color: var(--gold);
          padding: 4px 10px;
          border-radius: 4px;
          letter-spacing: .1em;
        }

        .wallet-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          border: 1px solid var(--line3);
          border-radius: var(--r);
          background: var(--bg2);
          font-family: var(--sans);
          font-size: .75rem;
          font-weight: 600;
          color: var(--ink2);
          cursor: pointer;
          transition: all .2s;
        }
        .wallet-btn:hover { border-color: var(--gold)55; color: var(--gold); background: var(--gold-dim); }
        .wallet-btn.live { border-color: var(--teal)55; color: var(--teal); background: var(--teal-dim); }

        .live-pulse {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--teal);
          position: relative;
        }
        .live-pulse::after {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 50%;
          border: 1px solid var(--teal);
          opacity: .4;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: .4; } 50% { transform: scale(1.5); opacity: 0; } }

        /* contract bar */
        .contract-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--bg2);
          border: 1px solid var(--line2);
          border-radius: var(--r);
          padding: 10px 16px;
          margin-bottom: 28px;
          flex-wrap: wrap;
        }
        .cb-label {
          font-size: .6rem;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: var(--ink3);
          flex-shrink: 0;
        }
        .cb-sep { width: 1px; height: 14px; background: var(--line3); flex-shrink: 0; }
        .cb-id {
          font-family: var(--mono);
          font-size: .68rem;
          color: var(--ink2);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cb-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: .68rem;
          color: var(--gold);
          text-decoration: none;
          border-bottom: 1px solid var(--gold)33;
          padding-bottom: 1px;
          white-space: nowrap;
          transition: all .15s;
        }
        .cb-link:hover { color: var(--gold2); border-color: var(--gold2)55; }

        /* ── nav tabs ── */
        .tab-nav {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 24px;
        }
        .tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 14px;
          border-radius: var(--r);
          border: 1px solid var(--line2);
          background: var(--bg2);
          cursor: pointer;
          transition: all .2s;
          font-family: var(--sans);
        }
        .tab-btn:hover:not(.tab-btn--on) { border-color: var(--line3); background: var(--bg3); }
        .tab-btn--on {
          background: var(--gold-dim);
          border-color: var(--gold)44;
        }
        .tab-icon {
          font-size: .8rem;
          color: var(--ink3);
          transition: color .2s;
          line-height: 1;
          width: 16px;
          text-align: center;
        }
        .tab-btn--on .tab-icon { color: var(--gold); }
        .tab-label {
          font-size: .73rem;
          font-weight: 600;
          color: var(--ink2);
          transition: color .2s;
        }
        .tab-btn--on .tab-label { color: var(--gold); }

        /* ── card ── */
        .card {
          background: var(--bg1);
          border: 1px solid var(--line2);
          border-radius: var(--r-xl);
          overflow: hidden;
          margin-bottom: 14px;
        }
        .card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 18px;
          border-bottom: 1px solid var(--line);
        }
        .card-title {
          font-family: var(--serif);
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--ink);
          letter-spacing: -.02em;
        }
        .card-body { padding: 24px; }

        /* badge */
        .badge {
          font-family: var(--mono);
          font-size: .58rem;
          letter-spacing: .1em;
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid;
          text-transform: uppercase;
        }
        .badge-gold { background: var(--gold-dim); color: var(--gold); border-color: var(--gold)33; }
        .badge-teal { background: var(--teal-dim); color: var(--teal); border-color: var(--teal)33; }
        .badge-red { background: var(--red-dim); color: var(--red); border-color: var(--red)33; }

        /* ── form elements ── */
        .field { margin-bottom: 16px; }
        .field-label {
          display: block;
          font-size: .62rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--ink3);
          margin-bottom: 6px;
        }
        .field-input {
          width: 100%;
          padding: 11px 14px;
          border: 1px solid var(--line2);
          border-radius: var(--r);
          background: var(--bg3);
          color: var(--ink);
          font-family: var(--mono);
          font-size: .78rem;
          outline: none;
          transition: border-color .2s, box-shadow .2s, background .2s;
        }
        .field-input:focus {
          border-color: var(--gold)55;
          background: var(--bg4);
          box-shadow: 0 0 0 3px var(--gold-glow);
        }
        .field-input::placeholder { color: var(--ink3); }
        .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        /* ── buttons ── */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 22px;
          border-radius: var(--r);
          border: 1px solid transparent;
          cursor: pointer;
          font-family: var(--sans);
          font-size: .8rem;
          font-weight: 600;
          transition: all .2s;
          letter-spacing: .01em;
          position: relative;
          overflow: hidden;
        }
        .btn:disabled { opacity: .35; cursor: not-allowed; }
        .btn-block { width: 100%; }

        .btn-gold {
          background: linear-gradient(135deg, var(--gold), #a8782a);
          color: #0a0800;
          border-color: var(--gold);
          box-shadow: 0 4px 20px var(--gold-glow);
        }
        .btn-gold:not(:disabled):hover {
          background: linear-gradient(135deg, var(--gold2), var(--gold));
          box-shadow: 0 6px 28px var(--gold-glow);
          transform: translateY(-1px);
        }
        .btn-gold:not(:disabled):active { transform: translateY(0); }

        .btn-outline {
          background: var(--bg3);
          color: var(--ink2);
          border-color: var(--line3);
        }
        .btn-outline:not(:disabled):hover { border-color: var(--line3); color: var(--ink); background: var(--bg4); }

        .btn-teal {
          background: #2dd4bf18;
          color: var(--teal);
          border-color: var(--teal)44;
        }
        .btn-teal:not(:disabled):hover { background: #2dd4bf28; border-color: var(--teal)77; transform: translateY(-1px); }

        .btn-red {
          background: #f8717118;
          color: var(--red);
          border-color: var(--red)44;
        }
        .btn-red:not(:disabled):hover { background: #f8717128; border-color: var(--red)77; transform: translateY(-1px); }

        /* ── deal card internals ── */
        .deal-hero {
          background: linear-gradient(135deg, #141a20 0%, #0f1318 100%);
          border-bottom: 1px solid var(--line2);
          padding: 28px 24px 22px;
          position: relative;
          overflow: hidden;
        }
        .deal-hero::before {
          content: '';
          position: absolute;
          top: -60px;
          right: -60px;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, var(--gold)08 0%, transparent 70%);
          pointer-events: none;
        }
        .deal-hero-eyebrow {
          font-family: var(--mono);
          font-size: .62rem;
          color: var(--gold);
          letter-spacing: .14em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .deal-hero-amount {
          font-family: var(--serif);
          font-size: 3rem;
          font-weight: 700;
          letter-spacing: -.04em;
          line-height: 1;
          color: var(--ink);
        }
        .deal-hero-unit {
          font-family: var(--sans);
          font-size: 1rem;
          color: var(--ink3);
          margin-left: 8px;
          font-weight: 400;
        }
        .deal-stats {
          display: flex;
          gap: 24px;
          margin-top: 16px;
        }
        .deal-stat {}
        .deal-stat-label {
          font-size: .6rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--ink3);
          margin-bottom: 3px;
        }
        .deal-stat-value {
          font-family: var(--mono);
          font-size: .8rem;
          color: var(--ink2);
        }

        .deal-addrs {
          display: flex;
          gap: 8px;
          padding: 14px 24px;
          border-bottom: 1px solid var(--line);
          flex-wrap: wrap;
        }
        .addr-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg3);
          border: 1px solid var(--line2);
          border-radius: 4px;
          padding: 5px 10px;
          font-family: var(--mono);
          font-size: .65rem;
        }
        .addr-role { color: var(--ink3); }
        .addr-val { color: var(--ink); }
        .addr-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--line3);
          flex-shrink: 0;
        }

        /* progress */
        .prog-section { padding: 20px 24px; border-bottom: 1px solid var(--line); }
        .prog-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 10px;
        }
        .prog-title {
          font-size: .62rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--ink3);
        }
        .prog-frac {
          font-family: var(--mono);
          font-size: .75rem;
          color: var(--gold);
          font-weight: 700;
        }
        .prog-bar {
          height: 4px;
          background: var(--line2);
          border-radius: 99px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        .prog-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--gold), var(--gold2));
          border-radius: 99px;
          transition: width .6s cubic-bezier(.4,0,.2,1);
          box-shadow: 0 0 8px var(--gold-glow);
        }

        .cp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
          gap: 5px;
        }
        .cp-cell {
          aspect-ratio: 1;
          border: 1px solid var(--line2);
          border-radius: 4px;
          background: var(--bg3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--mono);
          font-size: .6rem;
          color: var(--ink3);
          transition: all .2s;
        }
        .cp-cell.done {
          background: var(--teal-dim);
          border-color: var(--teal)44;
          color: var(--teal);
        }

        /* action zone */
        .action-section { padding: 20px 24px; }
        .action-title {
          font-size: .62rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--ink3);
          margin-bottom: 14px;
        }

        /* card footer */
        .card-footer {
          padding: 12px 24px;
          border-top: 1px solid var(--line);
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: .62rem;
          color: var(--ink3);
        }
        .cf-label { font-family: var(--mono); }

        /* desc text */
        .desc {
          font-size: .82rem;
          color: var(--ink2);
          line-height: 1.75;
          margin-bottom: 20px;
          padding: 14px 16px;
          background: var(--bg3);
          border-radius: var(--r);
          border-left: 2px solid var(--line3);
        }

        /* ── divider ── */
        .divider { height: 1px; background: var(--line); margin: 20px 0; }

        /* ── notifications ── */
        .notif-area {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 99;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          pointer-events: none;
          width: min(440px, 92vw);
        }
        .notif {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          border-radius: var(--r);
          font-size: .76rem;
          font-family: var(--sans);
          font-weight: 500;
          animation: notifIn .24s cubic-bezier(.4,0,.2,1);
          border: 1px solid;
          pointer-events: all;
          width: 100%;
          backdrop-filter: blur(12px);
        }
        .notif--ok {
          background: #0a1f17ee;
          border-color: var(--teal)44;
          color: var(--teal);
        }
        .notif--err {
          background: #1f0a0aee;
          border-color: var(--red)44;
          color: var(--red);
        }
        .notif-icon {
          width: 20px; height: 20px;
          border-radius: 50%;
          border: 1px solid currentColor;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          opacity: .8;
        }
        .notif-text { flex: 1; }
        .notif-cta {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: currentColor;
          text-decoration: none;
          font-size: .68rem;
          border-bottom: 1px solid currentColor;
          padding-bottom: 1px;
          opacity: .7;
          flex-shrink: 0;
        }
        .notif-cta:hover { opacity: 1; }
        @keyframes notifIn {
          from { opacity: 0; transform: translateY(12px) scale(.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        .rotating { animation: spin .7s linear infinite; }

        @media (max-width: 600px) {
          .duo { grid-template-columns: 1fr; }
          .tab-nav { grid-template-columns: repeat(2, 1fr); }
          .deal-hero-amount { font-size: 2.2rem; }
        }
      `}</style>

      <div className="shell">

        {/* ── Masthead ── */}
        <header className="masthead">
          <div className="brand-lockup">
            <div className="brand-icon"><IcoLock /></div>
            <div className="brand-text">
              <div className="brand-name">PaymentGate</div>
              <div className="brand-tagline">Milestone escrow · Stellar Soroban</div>
            </div>
          </div>
          <div className="masthead-right">
            <span className="net-badge">TESTNET</span>
            <button className={`wallet-btn ${walletAddr ? "live" : ""}`} onClick={connectWallet}>
              {walletAddr ? <span className="live-pulse" /> : <IcoWallet />}
              {walletAddr ? shortAddr(walletAddr) : "Connect Wallet"}
            </button>
          </div>
        </header>

        {/* ── Contract Bar ── */}
        <div className="contract-bar">
          <span className="cb-label">Contract</span>
          <span className="cb-sep" />
          <span className="cb-id" title={CONTRACT_ID}>{CONTRACT_ID}</span>
          <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="cb-link">
            stellar.expert <IcoLink />
          </a>
        </div>

        {/* ── Tab Navigation ── */}
        <nav className="tab-nav">
          {navItems.map(item => (
            <button
              key={item.key}
              className={`tab-btn ${view === item.key ? "tab-btn--on" : ""}`}
              onClick={() => setView(item.key)}
            >
              <span className="tab-icon">{item.icon}</span>
              <span className="tab-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* ── NEW DEAL ── */}
        {view === "new" && (
          <div className="card">
            <div className="card-top">
              <span className="card-title">Open a New Deal</span>
              <span className="badge badge-gold">Soroban</span>
            </div>
            <div className="card-body">
              <div className="duo">
                <div className="field">
                  <label className="field-label">Deal ID</label>
                  <input className="field-input" placeholder="project_alpha" value={form.dealId}
                    onChange={e => setForm(f => ({ ...f, dealId: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Checkpoints</label>
                  <input className="field-input" type="number" min="1" max="20" placeholder="3"
                    value={form.checkpoints}
                    onChange={e => setForm(f => ({ ...f, checkpoints: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Depositor Address</label>
                <input className="field-input" placeholder="G…" value={form.depositor}
                  onChange={e => setForm(f => ({ ...f, depositor: e.target.value }))} />
              </div>
              <div className="field">
                <label className="field-label">Beneficiary Address</label>
                <input className="field-input" placeholder="G…" value={form.beneficiary}
                  onChange={e => setForm(f => ({ ...f, beneficiary: e.target.value }))} />
              </div>
              <div className="field">
                <label className="field-label">Amount (XLM)</label>
                <input className="field-input" type="number" placeholder="100" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <button className="btn btn-gold btn-block" onClick={openDeal} disabled={busy || !walletAddr}>
                {busy ? <IcoSpin /> : <IcoSend />}
                {busy ? "Broadcasting…" : "Lock & Open Deal"}
              </button>
            </div>
            <div className="card-footer">
              <IcoShield />
              <span className="cf-label">Contract:</span>
              <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="cb-link">
                {shortContract(CONTRACT_ID)} <IcoLink />
              </a>
            </div>
          </div>
        )}

        {/* ── TRACK ── */}
        {view === "track" && (
          <>
            <div className="card">
              <div className="card-top">
                <span className="card-title">Track a Deal</span>
              </div>
              <div className="card-body">
                <div className="duo">
                  <div className="field">
                    <label className="field-label">Deal ID</label>
                    <input className="field-input" placeholder="project_alpha" value={lookupId}
                      onChange={e => setLookupId(e.target.value)} />
                  </div>
                  <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
                    <button className="btn btn-outline btn-block" style={{ marginTop: 0 }}
                      onClick={() => loadDeal(lookupId)} disabled={busy}>
                      {busy ? <IcoSpin /> : <IcoSearch />} Fetch Deal
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {dealData && (
              <div className="card">
                <div className="deal-hero">
                  <div className="deal-hero-eyebrow"># {lookupId}</div>
                  <div className="deal-hero-amount">
                    {fmt(dealData.locked_amount)}
                    <span className="deal-hero-unit">XLM</span>
                  </div>
                  <div className="deal-stats">
                    <div className="deal-stat">
                      <div className="deal-stat-label">Released</div>
                      <div className="deal-stat-value">{fmt(dealData.disbursed)} XLM</div>
                    </div>
                    <div className="deal-stat">
                      <div className="deal-stat-label">Remaining</div>
                      <div className="deal-stat-value">{fmt(dealData.locked_amount - dealData.disbursed)} XLM</div>
                    </div>
                    <div className="deal-stat">
                      <div className="deal-stat-label">Status</div>
                      <div className="deal-stat-value" style={{ color: approvedCount === totalCp ? "var(--teal)" : "var(--gold)" }}>
                        {approvedCount === totalCp ? "Complete" : "Active"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="deal-addrs">
                  <div className="addr-chip">
                    <span className="addr-role">Depositor</span>
                    <span className="addr-dot" />
                    <span className="addr-val">{shortAddr(dealData.depositor?.toString())}</span>
                  </div>
                  <div className="addr-chip">
                    <span className="addr-role">Beneficiary</span>
                    <span className="addr-dot" />
                    <span className="addr-val">{shortAddr(dealData.beneficiary?.toString())}</span>
                  </div>
                </div>

                <div className="prog-section">
                  <div className="prog-header">
                    <span className="prog-title">Checkpoint Progress</span>
                    <span className="prog-frac">{approvedCount} / {totalCp} &mdash; {pct}%</span>
                  </div>
                  <div className="prog-bar">
                    <div className="prog-fill" style={{ width: pct + "%" }} />
                  </div>
                  <div className="cp-grid">
                    {dealData.checkpoints?.map((done, i) => (
                      <div key={i} className={`cp-cell ${done ? "done" : ""}`} title={`Checkpoint ${i + 1}`}>
                        {done ? <IcoTick /> : i + 1}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="action-section">
                  <div className="action-title">Approve Checkpoint — Depositor only</div>
                  <div className="duo">
                    <div className="field">
                      <label className="field-label">Index (0-based)</label>
                      <input className="field-input" type="number" min="0" placeholder="0"
                        value={cpIndex} onChange={e => setCpIndex(e.target.value)} />
                    </div>
                    <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
                      <button className="btn btn-teal btn-block" style={{ marginTop: 0 }}
                        onClick={approveCheckpoint} disabled={busy || !walletAddr}>
                        {busy ? <IcoSpin /> : <IcoTick />} Approve
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── WITHDRAW ── */}
        {view === "withdraw" && (
          <div className="card">
            <div className="card-top">
              <span className="card-title">Withdraw Funds</span>
              <span className="badge badge-teal">Beneficiary</span>
            </div>
            <div className="card-body">
              <p className="desc">
                Releases funds proportional to approved checkpoints directly to the beneficiary.
                Only the designated beneficiary can initiate a withdrawal.
              </p>
              <div className="field">
                <label className="field-label">Deal ID</label>
                <input className="field-input" placeholder="project_alpha" value={withdrawId}
                  onChange={e => setWithdrawId(e.target.value)} />
              </div>
              <button className="btn btn-teal btn-block" onClick={withdraw} disabled={busy || !walletAddr}>
                {busy ? <IcoSpin /> : <IcoArrow />}
                {busy ? "Processing…" : "Withdraw Funds"}
              </button>
            </div>
            <div className="card-footer">
              <IcoShield />
              <span className="cf-label">Contract:</span>
              <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="cb-link">
                {shortContract(CONTRACT_ID)} <IcoLink />
              </a>
            </div>
          </div>
        )}

        {/* ── VOID ── */}
        {view === "void" && (
          <div className="card">
            <div className="card-top">
              <span className="card-title">Void Deal &amp; Refund</span>
              <span className="badge badge-red">Depositor</span>
            </div>
            <div className="card-body">
              <p className="desc">
                Cancels the deal and returns all remaining locked tokens to the depositor.
                Only the original depositor may void an active deal.
              </p>
              <div className="field">
                <label className="field-label">Deal ID</label>
                <input className="field-input" placeholder="project_alpha" value={voidId}
                  onChange={e => setVoidId(e.target.value)} />
              </div>
              <button className="btn btn-red btn-block" onClick={voidDeal} disabled={busy || !walletAddr}>
                {busy ? <IcoSpin /> : <IcoClose />}
                {busy ? "Processing…" : "Void & Refund"}
              </button>
            </div>
            <div className="card-footer">
              <IcoShield />
              <span className="cf-label">Contract:</span>
              <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="cb-link">
                {shortContract(CONTRACT_ID)} <IcoLink />
              </a>
            </div>
          </div>
        )}

      </div>

      <Notification items={notices} />
    </>
  );
}