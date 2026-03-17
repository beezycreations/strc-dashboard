"use client";

import { fmtPct } from "@/src/lib/utils/format";
import MstrMnavChart from "../charts/MstrMnavChart";
import BtcPurchaseChart from "../charts/BtcPurchaseChart";
import VolumeATMTracker from "../VolumeATMTracker";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  snap: any;
}

export default function FundamentalsSection({ snap }: Props) {
  const s = snap;

  return (
    <section id="strc-fundamentals" className="section-anchor">
      <div className="section-header">Fundamentals</div>

      {/* MSTR Historical mNAV Chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <MstrMnavChart />
      </div>

      {/* Flywheel metrics row */}
      <div className="metric-grid" style={{ marginBottom: 20 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>BTC Yield YTD</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--green)" }}>{s.btc_yield_ytd != null ? fmtPct(s.btc_yield_ytd * 100, 1) : "—"}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>mBTC/share accumulated</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>BTC Dollar Gain YTD</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>{s.btc_dollar_gain_ytd != null ? `$${(s.btc_dollar_gain_ytd / 1e9).toFixed(1)}B` : "—"}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>BTC Conversion Rate</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--amber)" }}>{s.btc_conversion_rate != null ? fmtPct(s.btc_conversion_rate * 100, 0) : "—"}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Regime: {s.mnav_regime}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>mNAV Break-Even BTC</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>{s.mnav_breakeven_btc != null ? `$${s.mnav_breakeven_btc.toLocaleString()}` : "—"}</div>
        </div>
      </div>

      {/* Volume + ATM Issuance Tracker */}
      <div style={{ marginBottom: 20 }}>
        <VolumeATMTracker />
      </div>

      {/* Strategy Bitcoin Purchases */}
      <div style={{ marginBottom: 20 }}>
        <BtcPurchaseChart />
      </div>

    </section>
  );
}
