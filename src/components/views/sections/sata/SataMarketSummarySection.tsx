"use client";

import { KpiCard, CapitalStackBar, AsOf, LiveCard } from "@/src/components/ui";
import Badge from "@/src/components/ui/Badge";
import { fmtPct, fmtBps, fmtMultiple } from "@/src/lib/utils/format";
import { SATA_NOTIONAL, SEMLER_CONVERT_NOTES } from "@/src/lib/data/sata-capital-structure";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  snap: any;
  history: any;
}

export default function SataMarketSummarySection({ snap, history }: Props) {
  const s = snap;
  const ts = s.last_updated;
  const prices = history?.prices ?? [];

  return (
    <section id="sata-market" className="section-anchor">
      <div className="section-header">Market Summary</div>

      {/* KPI Strip — 6 cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard
          label="SATA Price"
          dotColor="var(--accent)"
          value={s.sata_price != null ? `$${s.sata_price.toFixed(2)}` : "—"}
          delta={s.sata_par_spread_bps != null ? fmtBps(s.sata_par_spread_bps) : undefined}
          deltaType={s.sata_par_spread_bps != null && s.sata_par_spread_bps >= 0 ? "up" : "down"}
          footer={<span>Eff. Yield {s.sata_effective_yield != null ? fmtPct(s.sata_effective_yield) : "—"} <AsOf ts={ts} /></span>}
        />
        <KpiCard
          label="Current Rate"
          dotColor="var(--violet)"
          value={s.sata_rate_pct != null ? fmtPct(s.sata_rate_pct) : "—"}
          delta="Variable"
          deltaType="neutral"
          footer={<span>SOFR + spread · Monthly</span>}
        />
        <KpiCard
          label="ASST Price"
          dotColor="var(--t2)"
          value={s.asst_price != null ? `$${s.asst_price.toFixed(2)}` : "N/A"}
          delta={s.asst_change_pct != null ? <span>{s.asst_change_pct >= 0 ? "+" : ""}{s.asst_change_pct.toFixed(2)}% today <AsOf ts={ts} /></span> : undefined}
          deltaType={s.asst_change_pct != null ? (s.asst_change_pct >= 0 ? "up" : "down") : "neutral"}
          footer="Strive Inc (parent)"
        />
        <KpiCard
          label="EV/mNAV"
          dotColor="var(--amber)"
          value={s.ev_mnav != null ? fmtMultiple(s.ev_mnav) : "—"}
          delta={s.ev_mnav != null && s.ev_mnav < 1 ? "Discount" : s.ev_mnav != null && s.ev_mnav > 1 ? "Premium" : undefined}
          deltaType={s.ev_mnav != null && s.ev_mnav <= 1 ? "down" : "up"}
          footer={<Badge variant={s.ev_mnav != null && s.ev_mnav <= 1 ? "green" : "amber"}>{s.ev_mnav != null && s.ev_mnav <= 1 ? "discount" : "premium"}</Badge>}
        />
        <KpiCard
          label="Bitcoin Price"
          dotColor="var(--btc)"
          value={s.btc_price != null ? `$${s.btc_price.toLocaleString()}` : "—"}
          delta={s.btc_24h_pct != null ? <span>{s.btc_24h_pct >= 0 ? "+" : ""}{s.btc_24h_pct.toFixed(2)}% 24h <AsOf ts={ts} /></span> : undefined}
          deltaType={s.btc_24h_pct != null ? (s.btc_24h_pct >= 0 ? "up" : "down") : "neutral"}
          footer={s.btc_holdings != null ? `${s.btc_holdings.toLocaleString()} BTC held` : "—"}
        />
        <KpiCard
          label="Amplification"
          dotColor="var(--red)"
          value={s.amplification_ratio != null ? `${s.amplification_ratio.toFixed(1)}%` : "—"}
          highlighted
          footer={s.btc_nav != null ? `BTC NAV: $${(s.btc_nav / 1e9).toFixed(2)}B` : "—"}
        />
      </div>

      {/* Price chart | Capital Stack */}
      <div className="grid-7-5" style={{ marginBottom: 20 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>SATA Price History</div>
          <div style={{ flex: 1, minHeight: 0, height: 280 }}>
            {prices.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={prices} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip contentStyle={rechartsDefaults.tooltipStyle} />
                  <Line type="monotone" dataKey="sata" name="SATA" stroke={colors.accent} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>
                Price data loading...
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Capital Stack</div>
          <CapitalStackBar
            segments={[
              { label: "Semler Notes", notional: SEMLER_CONVERT_NOTES, color: "var(--t3)", rate: "conv.", rank: 1 },
              { label: "SATA", notional: SATA_NOTIONAL, color: "var(--accent)", rate: `${s.sata_rate_pct ?? 12.75}%`, rank: 2 },
            ]}
            btcNav={s.btc_nav}
            highlightTicker="SATA"
          />
        </div>
      </div>

      {/* Market Metrics row */}
      <div className="metric-grid">
        <LiveCard label="Notional ($M)" value={`$${(SATA_NOTIONAL / 1e6).toFixed(0)}`} sub="Par value outstanding" ts={ts} />
        <LiveCard label="ASST Market Cap" value={s.asst_market_cap != null ? `$${(s.asst_market_cap / 1e6).toFixed(0)}M` : null} sub="Parent equity" ts={ts} />
        <LiveCard label="BTC NAV" value={s.btc_nav != null ? `$${(s.btc_nav / 1e9).toFixed(2)}B` : null} sub={`${(s.btc_holdings ?? 0).toLocaleString()} BTC`} ts={ts} />
        <LiveCard label="Reserve Runway" value={s.total_reserve_months != null ? `${s.total_reserve_months.toFixed(0)} months` : null} sub="Cash + STRC holdings" ts={ts} />
      </div>
    </section>
  );
}
