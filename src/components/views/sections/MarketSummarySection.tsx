"use client";

import { KpiCard, CapitalStackBar, CountdownChip, AsOf, LiveCard } from "@/src/components/ui";
import Badge from "@/src/components/ui/Badge";
import { fmtPct, fmtBps, fmtMultiple } from "@/src/lib/utils/format";
import { CONVERT_DEBT_USD, PREF_BASE } from "@/src/lib/data/capital-structure";
import PriceRateChart from "../charts/PriceRateChart";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  snap: any;
  history: any;
}

export default function MarketSummarySection({ snap, history }: Props) {
  const s = snap;
  const ts = s.last_updated;

  return (
    <section id="strc-market" className="section-anchor">
      <div className="section-header">Market Summary</div>

      {/* KPI Strip — 6 cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--card-gap)", marginBottom: 20 }}>
        <KpiCard
          label="STRC Price"
          dotColor="var(--accent)"
          value={s.strc_price != null ? `$${s.strc_price.toFixed(2)}` : "—"}
          delta={s.strc_par_spread_bps != null ? fmtBps(s.strc_par_spread_bps) : undefined}
          deltaType={s.strc_par_spread_bps != null && s.strc_par_spread_bps >= 0 ? "up" : "down"}
          footer={<span>Eff. Yield {fmtPct(s.strc_effective_yield)} <AsOf ts={ts} /></span>}
        />
        <KpiCard
          label="Current Rate"
          dotColor="var(--violet)"
          value={fmtPct(s.strc_rate_pct)}
          delta={fmtBps(s.strc_rate_since_ipo_bps) + " since IPO"}
          deltaType="up"
          footer={<CountdownChip daysUntil={s.days_to_announcement} date="" label="to announcement" />}
        />
        <KpiCard
          label="MSTR Price"
          dotColor="var(--t2)"
          value={s.mstr_price != null ? `$${s.mstr_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "N/A"}
          delta={s.mstr_change_pct != null ? <span>{s.mstr_change_pct >= 0 ? "+" : ""}{s.mstr_change_pct.toFixed(2)}% today <AsOf ts={ts} /></span> : undefined}
          deltaType={s.mstr_change_pct != null ? (s.mstr_change_pct >= 0 ? "up" : "down") : "neutral"}
        />
        <KpiCard
          label="mNAV"
          dotColor="var(--amber)"
          value={fmtMultiple(s.mnav)}
          delta={s.mnav_30d_trend != null ? <span>{s.mnav_30d_trend >= 0 ? "+" : ""}{s.mnav_30d_trend.toFixed(2)} 30d <AsOf ts={ts} /></span> : undefined}
          deltaType={s.mnav_30d_trend != null ? (s.mnav_30d_trend >= 0 ? "up" : "down") : "neutral"}
          footer={<Badge variant={s.mnav_regime === "discount" ? "green" : s.mnav_regime === "tactical" ? "amber" : "red"}>{s.mnav_regime}</Badge>}
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
          label="BTC Reserve"
          dotColor="var(--btc)"
          value={s.btc_nav != null ? `$${(s.btc_nav / 1e9).toFixed(1)}B` : "—"}
          highlighted
          footer={s.btc_coverage_ratio != null ? `${fmtMultiple(s.btc_coverage_ratio)} coverage${s.btc_impairment_price != null ? ` · Impairment $${(s.btc_impairment_price / 1000).toFixed(1)}K` : ""}` : "—"}
        />
      </div>

      {/* Price + Rate chart | Capital Stack */}
      <div className="grid-7-5" style={{ minHeight: 420, marginBottom: 20 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>STRC Price and Rate History</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PriceRateChart data={history} />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Capital Stack</div>
          <CapitalStackBar
            segments={[
              { label: "Converts", notional: CONVERT_DEBT_USD, color: "var(--t3)", rate: "~0.4%", rank: 1 },
              { label: "STRF", notional: PREF_BASE.STRF, color: "var(--amber)", rate: "10.0%", rank: 2 },
              { label: "STRC", notional: s.strc_notional ?? PREF_BASE.STRC, color: "var(--accent)", rate: `${s.strc_rate_pct}%`, rank: 3 },
              { label: "STRK", notional: PREF_BASE.STRK, color: "var(--violet)", rate: "8.0%", rank: 4 },
              { label: "STRD", notional: PREF_BASE.STRD, color: "var(--red)", rate: "10.0%", rank: 5 },
            ]}
            btcNav={s.btc_nav}
            highlightTicker="STRC"
          />
        </div>
      </div>

      {/* STRC Market Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--card-gap)" }}>
        <LiveCard label="Notional ($M)" value={s.strc_notional != null ? `$${(s.strc_notional / 1e6).toFixed(1)}` : null} sub="Par value outstanding" ts={ts} />
        <LiveCard label="Market Cap ($M)" value={s.strc_market_cap != null ? `$${(s.strc_market_cap / 1e6).toFixed(1)}` : null} sub="Shares × price" ts={ts} />
        <LiveCard label="50d Avg Price" value={s.strc_1m_vwap != null ? `$${Number(s.strc_1m_vwap).toFixed(2)}` : null} sub="50-day moving average" ts={ts} />
        <LiveCard label="Trading Volume ($M)" value={s.strc_trading_volume_usd != null ? `$${(s.strc_trading_volume_usd / 1e6).toFixed(1)}` : null} sub={"Today\u0027s dollar volume"} ts={ts} />
      </div>
    </section>
  );
}
