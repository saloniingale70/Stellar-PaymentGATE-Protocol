import { useState, useCallback } from "react";
import * as FreighterApi from "@stellar/freighter-api";
import * as StellarSdk from "@stellar/stellar-sdk";

// ── env ──────────────────────────────────────────────────────────────────────
const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID;
const RPC_URL = import.meta.env.VITE_RPC_URL;
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE;

const XLM_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

// ── explorer ─────────────────────────────────────────────────────────────────
const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";
const CONTRACT_EXPLORER_URL = `${EXPLORER_BASE}/contract/${CONTRACT_ID}`;
const txExplorerUrl = (hash) => `${EXPLORER_BASE}/tx/${hash}`;

// ── rpc ───────────────────────────────────────────────────────────────────────
const rpc = new StellarSdk.rpc.Server(RPC_URL);

function fmt(val) { return (Number(val) / 1e7).toFixed(2); }
function shortAddr(addr) { if (!addr) return ""; return addr.slice(0, 6) + "…" + addr.slice(-4); }
function shortContract(id) { if (!id) return ""; return id.slice(0, 8) + "…" + id.slice(-6); }

// ── icons ─────────────────────────────────────────────────────────────────────
const IcoLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IcoClose = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 3H8l-2 4h12l-2-4z"/><circle cx="17" cy="14" r="1" fill="currentColor"/>
  </svg>
);
const IcoChevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

// ── notification ──────────────────────────────────────────────────────────────
function Notification({ items }) {
  return (
    <div className="notif-area">
      {items.map(n => (
        <div key={n.id} className={`notif notif--${n.kind}`}>
          <span className="notif-icon">{n.kind === "ok" ? <IcoTick /> : <IcoClose />}</span>
          <span className="notif-text">{n.msg}</span>
          {n.txHash && (
            <a href={txExplorerUrl(n.txHash)} target="_blank" rel="noopener noreferrer" className="notif-cta">
              Tx <IcoLink />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ── step tab ──────────────────────────────────────────────────────────────────
function StepTab({ label, num, active, onClick }) {
  return (
    <button className={`step-tab ${active ? "step-tab--on" : ""}`} onClick={onClick}>
      <span className="step-num">{num}</span>
      <span className="step-label">{label}</span>
      <span className="step-arrow"><IcoChevron /></span>
    </button>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
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

  // ── notices
  const notify = useCallback((msg, kind = "ok", txHash = null) => {
    const id = Date.now();
    setNotices(n => [...n, { id, msg, kind, txHash }]);
    setTimeout(() => setNotices(n => n.filter(x => x.id !== id)), 6000);
  }, []);

  // ── wallet
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

  // ── invoke
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

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --page: #f5f0e8;
          --card: #faf7f2;
          --card2: #f0ebe0;
          --line: #ddd5c4;
          --line2: #c8bfae;
          --ink: #1a1612;
          --ink2: #5c5446;
          --ink3: #9c9080;
          --rust: #b84a2e;
          --rust-dim: #b84a2e18;
          --sage: #3a6b4a;
          --sage-dim: #3a6b4a15;
          --gold: #c4862a;
          --gold-dim: #c4862a18;
          --navy: #1e3a5f;
          --navy-dim: #1e3a5f12;
          --serif: 'Playfair Display', serif;
          --sans: 'Instrument Sans', sans-serif;
          --mono: 'JetBrains Mono', monospace;
          --r: 4px;
          --r-lg: 8px;
          --shadow: 0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.04);
          --shadow-up: 0 4px 24px rgba(0,0,0,.1);
        }

        body {
          background: var(--page);
          color: var(--ink);
          font-family: var(--sans);
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }

        /* halftone bg */
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: radial-gradient(circle, var(--line) 1px, transparent 1px);
          background-size: 28px 28px;
          opacity: .5;
          pointer-events: none;
        }

        .shell {
          position: relative;
          z-index: 1;
          max-width: 780px;
          margin: 0 auto;
          padding: 32px 20px 80px;
        }

        /* ── masthead ── */
        .masthead {
          border-top: 3px solid var(--ink);
          border-bottom: 1px solid var(--line2);
          padding: 18px 0 16px;
          margin-bottom: 28px;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 12px;
        }
        .masthead-left {}
        .brand {
          font-family: var(--serif);
          font-size: 1.7rem;
          font-weight: 800;
          letter-spacing: -.03em;
          color: var(--ink);
          line-height: 1;
          display: flex;
          align-items: baseline;
          gap: 10px;
        }
        .brand-sub {
          font-family: var(--sans);
          font-size: .65rem;
          font-weight: 600;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--ink3);
        }
        .masthead-tagline {
          font-size: .75rem;
          color: var(--ink3);
          margin-top: 4px;
          letter-spacing: .03em;
        }
        .masthead-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        /* network badge */
        .net-badge {
          font-family: var(--mono);
          font-size: .63rem;
          background: var(--gold-dim);
          border: 1px solid var(--gold);
          color: var(--gold);
          padding: 3px 8px;
          border-radius: 2px;
          letter-spacing: .08em;
        }

        /* wallet btn */
        .wallet-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: 1px solid var(--line2);
          border-radius: var(--r);
          background: var(--card);
          font-family: var(--sans);
          font-size: .75rem;
          font-weight: 600;
          color: var(--ink2);
          cursor: pointer;
          transition: all .15s;
          box-shadow: var(--shadow);
        }
        .wallet-btn:hover { border-color: var(--navy); color: var(--navy); }
        .wallet-btn.live { border-color: var(--sage); color: var(--sage); }
        .live-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--sage);
        }

        /* contract row */
        .contract-row {
          background: var(--card2);
          border: 1px solid var(--line);
          border-radius: var(--r);
          padding: 9px 14px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--mono);
          font-size: .68rem;
          flex-wrap: wrap;
        }
        .cr-label {
          font-family: var(--sans);
          font-size: .63rem;
          font-weight: 600;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--ink3);
          flex-shrink: 0;
        }
        .cr-id { color: var(--ink2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cr-link {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          color: var(--rust);
          font-size: .65rem;
          text-decoration: none;
          border-bottom: 1px solid var(--rust)44;
          white-space: nowrap;
          transition: color .15s, border-color .15s;
        }
        .cr-link:hover { color: #962010; border-color: #96201066; }

        /* ── step nav ── */
        .step-nav {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          border: 1px solid var(--line2);
          border-radius: var(--r-lg);
          overflow: hidden;
          margin-bottom: 28px;
          background: var(--card);
          box-shadow: var(--shadow);
        }
        .step-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          border: none;
          background: transparent;
          border-right: 1px solid var(--line);
          cursor: pointer;
          transition: background .15s;
          text-align: left;
        }
        .step-tab:last-child { border-right: none; }
        .step-tab:hover:not(.step-tab--on) { background: var(--card2); }
        .step-tab--on { background: var(--ink); }
        .step-num {
          width: 20px; height: 20px;
          border-radius: 50%;
          border: 1.5px solid var(--line2);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono);
          font-size: .65rem;
          font-weight: 500;
          color: var(--ink3);
          flex-shrink: 0;
          transition: all .15s;
        }
        .step-tab--on .step-num {
          border-color: #ffffff44;
          color: #fff;
          background: #ffffff18;
        }
        .step-label {
          font-size: .75rem;
          font-weight: 600;
          color: var(--ink2);
          flex: 1;
          transition: color .15s;
        }
        .step-tab--on .step-label { color: #fff; }
        .step-arrow { color: var(--line2); transition: color .15s; }
        .step-tab--on .step-arrow { color: #ffffff44; }

        /* ── panel ── */
        .panel {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: var(--r-lg);
          overflow: hidden;
          box-shadow: var(--shadow);
          margin-bottom: 16px;
        }
        .panel-header {
          padding: 18px 22px 14px;
          border-bottom: 1px solid var(--line);
          display: flex;
          align-items: baseline;
          gap: 12px;
        }
        .panel-title {
          font-family: var(--serif);
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: -.02em;
        }
        .panel-body { padding: 22px; }

        /* tags */
        .tag {
          font-family: var(--mono);
          font-size: .6rem;
          letter-spacing: .08em;
          padding: 3px 7px;
          border-radius: 2px;
          border: 1px solid;
        }
        .tag-blue { background: var(--navy-dim); color: var(--navy); border-color: var(--navy)30; }
        .tag-green { background: var(--sage-dim); color: var(--sage); border-color: var(--sage)40; }
        .tag-red { background: var(--rust-dim); color: var(--rust); border-color: var(--rust)40; }

        /* ── form ── */
        .f { margin-bottom: 15px; }
        .lbl {
          display: block;
          font-size: .65rem;
          font-weight: 600;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--ink3);
          margin-bottom: 5px;
        }
        .inp {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--line2);
          border-radius: var(--r);
          background: #fff;
          color: var(--ink);
          font-family: var(--mono);
          font-size: .78rem;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .inp:focus { border-color: var(--navy); box-shadow: 0 0 0 3px var(--navy-dim); }
        .inp::placeholder { color: var(--ink3); }
        .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        /* ── buttons ── */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 11px 20px;
          border-radius: var(--r);
          border: 1px solid transparent;
          cursor: pointer;
          font-family: var(--sans);
          font-size: .8rem;
          font-weight: 600;
          transition: all .15s;
          letter-spacing: .01em;
        }
        .btn:disabled { opacity: .4; cursor: not-allowed; }
        .btn-block { width: 100%; margin-top: 6px; }
        .btn-dark { background: var(--ink); color: #fff; border-color: var(--ink); }
        .btn-dark:not(:disabled):hover { background: #2c2620; }
        .btn-outline { background: transparent; color: var(--ink); border-color: var(--line2); }
        .btn-outline:not(:disabled):hover { border-color: var(--ink); background: var(--card2); }
        .btn-sage { background: var(--sage); color: #fff; border-color: var(--sage); }
        .btn-sage:not(:disabled):hover { background: #2e5639; }
        .btn-rust { background: var(--rust); color: #fff; border-color: var(--rust); }
        .btn-rust:not(:disabled):hover { background: #962010; }

        /* ── deal card ── */
        .deal-hero {
          padding: 20px 22px 16px;
          border-bottom: 1px solid var(--line);
          background: var(--ink);
          color: #fff;
        }
        .deal-hero-id {
          font-family: var(--mono);
          font-size: .7rem;
          color: #ffffff66;
          margin-bottom: 6px;
        }
        .deal-hero-amount {
          font-family: var(--serif);
          font-size: 2.4rem;
          font-weight: 800;
          letter-spacing: -.04em;
          line-height: 1;
        }
        .deal-hero-unit {
          font-family: var(--sans);
          font-size: .85rem;
          color: #ffffff88;
          margin-left: 6px;
        }
        .deal-hero-status {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .deal-hero-stat {
          font-family: var(--mono);
          font-size: .68rem;
          color: #ffffff88;
        }
        .deal-hero-stat strong { color: #ffffffcc; }

        .deal-meta {
          padding: 14px 22px;
          border-bottom: 1px solid var(--line);
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .dm-item {
          font-family: var(--mono);
          font-size: .68rem;
          background: var(--card2);
          border: 1px solid var(--line);
          border-radius: 2px;
          padding: 5px 9px;
        }
        .dm-k { color: var(--ink3); }
        .dm-v { color: var(--ink); margin-left: 5px; }

        /* progress */
        .prog-area { padding: 18px 22px; border-bottom: 1px solid var(--line); }
        .prog-top {
          display: flex;
          justify-content: space-between;
          font-size: .72rem;
          color: var(--ink2);
          margin-bottom: 8px;
        }
        .prog-pct { font-family: var(--mono); font-weight: 600; color: var(--navy); }
        .prog-track {
          height: 6px;
          background: var(--line);
          border-radius: 99px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        .prog-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--navy), var(--sage));
          border-radius: 99px;
          transition: width .5s ease;
        }
        .cp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
          gap: 6px;
        }
        .cp-item {
          aspect-ratio: 1;
          border: 1px solid var(--line2);
          border-radius: 2px;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--mono);
          font-size: .64rem;
          color: var(--ink3);
          transition: all .15s;
        }
        .cp-item.ok {
          background: var(--sage);
          border-color: var(--sage);
          color: #fff;
        }

        .action-zone {
          padding: 18px 22px;
        }
        .az-label {
          font-size: .63rem;
          font-weight: 600;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--ink3);
          margin-bottom: 12px;
        }
        .rule { height: 1px; background: var(--line); margin: 18px 0; }

        /* desc */
        .desc-text {
          font-size: .82rem;
          color: var(--ink2);
          line-height: 1.7;
          margin-bottom: 18px;
        }

        /* footer line */
        .footer-strip {
          border-top: 1px solid var(--line);
          padding: 11px 22px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: .67rem;
          color: var(--ink3);
        }
        .fs-label { font-family: var(--mono); }

        /* ── notifications ── */
        .notif-area {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 99;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          pointer-events: none;
          width: min(420px, 92vw);
        }
        .notif {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          border-radius: var(--r);
          font-size: .76rem;
          font-family: var(--sans);
          font-weight: 500;
          animation: slideUp .22s ease;
          border: 1px solid;
          pointer-events: all;
          box-shadow: var(--shadow-up);
          width: 100%;
        }
        .notif--ok { background: #f0faf4; border-color: var(--sage)55; color: var(--sage); }
        .notif--err { background: #fdf4f2; border-color: var(--rust)55; color: var(--rust); }
        .notif-icon {
          width: 18px; height: 18px;
          border-radius: 50%;
          background: currentColor;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .notif-icon svg { stroke: #fff; }
        .notif-text { flex: 1; }
        .notif-cta {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          color: currentColor;
          text-decoration: none;
          font-size: .68rem;
          border-bottom: 1px solid currentColor;
          padding-bottom: 1px;
          opacity: .75;
          flex-shrink: 0;
        }
        .notif-cta:hover { opacity: 1; }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .rotating { animation: spin .7s linear infinite; }
      `}</style>

      <div className="shell">

        {/* ── masthead ── */}
        <header className="masthead">
          <div className="masthead-left">
            <div className="brand">
              <IcoLock />
              PaymentGate
              <span className="brand-sub">Protocol</span>
            </div>
            <div className="masthead-tagline">Milestone-based escrow on Stellar · Soroban smart contract</div>
          </div>
          <div className="masthead-right">
            <span className="net-badge">TESTNET</span>
            <button className={`wallet-btn ${walletAddr ? "live" : ""}`} onClick={connectWallet}>
              {walletAddr ? <span className="live-dot" /> : <IcoWallet />}
              {walletAddr ? shortAddr(walletAddr) : "Connect Wallet"}
            </button>
          </div>
        </header>

        {/* ── contract row ── */}
        <div className="contract-row">
          <span className="cr-label">Contract</span>
          <span className="cr-id" title={CONTRACT_ID}>{CONTRACT_ID}</span>
          <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="cr-link">
            stellar.expert <IcoLink />
          </a>
        </div>

        {/* ── step nav ── */}
        <nav className="step-nav">
          {[
            { key: "new", label: "New Deal" },
            { key: "track", label: "Track" },
            { key: "withdraw", label: "Withdraw" },
            { key: "void", label: "Void" },
          ].map((s, i) => (
            <StepTab
              key={s.key}
              num={i + 1}
              label={s.label}
              active={view === s.key}
              onClick={() => setView(s.key)}
            />
          ))}
        </nav>

        {/* ── NEW DEAL ── */}
        {view === "new" && (
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Open a New Deal</span>
              <span className="tag tag-blue">Soroban</span>
            </div>
            <div className="panel-body">
              <div className="duo">
                <div className="f">
                  <label className="lbl">Deal ID</label>
                  <input className="inp" placeholder="project_alpha" value={form.dealId}
                    onChange={e => setForm(f => ({ ...f, dealId: e.target.value }))} />
                </div>
                <div className="f">
                  <label className="lbl">Checkpoints</label>
                  <input className="inp" type="number" min="1" max="20" placeholder="3"
                    value={form.checkpoints}
                    onChange={e => setForm(f => ({ ...f, checkpoints: e.target.value }))} />
                </div>
              </div>
              <div className="f">
                <label className="lbl">Depositor Address</label>
                <input className="inp" placeholder="G…" value={form.depositor}
                  onChange={e => setForm(f => ({ ...f, depositor: e.target.value }))} />
              </div>
              <div className="f">
                <label className="lbl">Beneficiary Address</label>
                <input className="inp" placeholder="G…" value={form.beneficiary}
                  onChange={e => setForm(f => ({ ...f, beneficiary: e.target.value }))} />
              </div>
              <div className="f">
                <label className="lbl">Amount (XLM)</label>
                <input className="inp" type="number" placeholder="100" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <button className="btn btn-dark btn-block" onClick={openDeal} disabled={busy || !walletAddr}>
                {busy ? <IcoSpin /> : <IcoSend />}
                {busy ? "Broadcasting…" : "Lock & Open Deal"}
              </button>
            </div>
            <div className="footer-strip">
              <span className="fs-label">Contract:</span>
              <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="cr-link">
                {shortContract(CONTRACT_ID)} <IcoLink />
              </a>
            </div>
          </div>
        )}

        {/* ── TRACK ── */}
        {view === "track" && (
          <>
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Track a Deal</span>
              </div>
              <div className="panel-body">
                <div className="duo">
                  <div className="f">
                    <label className="lbl">Deal ID</label>
                    <input className="inp" placeholder="project_alpha" value={lookupId}
                      onChange={e => setLookupId(e.target.value)} />
                  </div>
                  <div className="f" style={{ display: "flex", alignItems: "flex-end" }}>
                    <button className="btn btn-outline btn-block" style={{ marginTop: 0 }}
                      onClick={() => loadDeal(lookupId)} disabled={busy}>
                      {busy ? <IcoSpin /> : <IcoSearch />} Fetch
                    </button>
                  </div>
                </div>
              </div>
              <div className="footer-strip">
                <span className="fs-label">Contract:</span>
                <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="cr-link">
                  {shortContract(CONTRACT_ID)} <IcoLink />
                </a>
              </div>
            </div>

            {dealData && (
              <div className="panel">
                <div className="deal-hero">
                  <div className="deal-hero-id">{lookupId}</div>
                  <div className="deal-hero-amount">
                    {fmt(dealData.locked_amount)}
                    <span className="deal-hero-unit">XLM</span>
                  </div>
                  <div className="deal-hero-status">
                    <div className="deal-hero-stat">
                      Released: <strong>{fmt(dealData.disbursed)} XLM</strong>
                    </div>
                    <div className="deal-hero-stat">
                      Remaining: <strong>{fmt(dealData.locked_amount - dealData.disbursed)} XLM</strong>
                    </div>
                  </div>
                </div>

                <div className="deal-meta">
                  <div className="dm-item">
                    <span className="dm-k">Depositor</span>
                    <span className="dm-v">{shortAddr(dealData.depositor?.toString())}</span>
                  </div>
                  <div className="dm-item">
                    <span className="dm-k">Beneficiary</span>
                    <span className="dm-v">{shortAddr(dealData.beneficiary?.toString())}</span>
                  </div>
                  <div className="dm-item">
                    <span className="dm-k">Status</span>
                    <span className="dm-v">{approvedCount === totalCp ? "✓ Complete" : "Active"}</span>
                  </div>
                </div>

                <div className="prog-area">
                  <div className="prog-top">
                    <span>Checkpoint progress</span>
                    <span className="prog-pct">{approvedCount} / {totalCp} — {pct}%</span>
                  </div>
                  <div className="prog-track">
                    <div className="prog-fill" style={{ width: pct + "%" }} />
                  </div>
                  <div className="cp-grid">
                    {dealData.checkpoints?.map((done, i) => (
                      <div key={i} className={`cp-item ${done ? "ok" : ""}`} title={`Checkpoint ${i + 1}`}>
                        {done ? <IcoTick /> : i + 1}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="action-zone">
                  <div className="az-label">Approve checkpoint (depositor only)</div>
                  <div className="duo">
                    <div className="f">
                      <label className="lbl">Index (0-based)</label>
                      <input className="inp" type="number" min="0" placeholder="0"
                        value={cpIndex} onChange={e => setCpIndex(e.target.value)} />
                    </div>
                    <div className="f" style={{ display: "flex", alignItems: "flex-end" }}>
                      <button className="btn btn-sage btn-block" style={{ marginTop: 0 }}
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
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Withdraw Funds</span>
              <span className="tag tag-green">Beneficiary</span>
            </div>
            <div className="panel-body">
              <p className="desc-text">
                Releases funds proportional to approved checkpoints directly to the beneficiary.
                Only the designated beneficiary can initiate a withdrawal.
              </p>
              <div className="f">
                <label className="lbl">Deal ID</label>
                <input className="inp" placeholder="project_alpha" value={withdrawId}
                  onChange={e => setWithdrawId(e.target.value)} />
              </div>
              <button className="btn btn-sage btn-block" onClick={withdraw} disabled={busy || !walletAddr}>
                {busy ? <IcoSpin /> : <IcoSend />}
                {busy ? "Processing…" : "Withdraw Funds"}
              </button>
            </div>
            <div className="footer-strip">
              <span className="fs-label">Contract:</span>
              <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="cr-link">
                {shortContract(CONTRACT_ID)} <IcoLink />
              </a>
            </div>
          </div>
        )}

        {/* ── VOID ── */}
        {view === "void" && (
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Void Deal & Refund</span>
              <span className="tag tag-red">Depositor</span>
            </div>
            <div className="panel-body">
              <p className="desc-text">
                Cancels the deal and returns all remaining locked tokens to the depositor.
                Only the original depositor may void an active deal.
              </p>
              <div className="f">
                <label className="lbl">Deal ID</label>
                <input className="inp" placeholder="project_alpha" value={voidId}
                  onChange={e => setVoidId(e.target.value)} />
              </div>
              <button className="btn btn-rust btn-block" onClick={voidDeal} disabled={busy || !walletAddr}>
                {busy ? <IcoSpin /> : <IcoClose />}
                {busy ? "Processing…" : "Void & Refund"}
              </button>
            </div>
            <div className="footer-strip">
              <span className="fs-label">Contract:</span>
              <a href={CONTRACT_EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="cr-link">
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