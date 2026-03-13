"use client";

import { useSnapshot, useHistory } from "@/src/lib/hooks/use-api";
import { KpiCard, StatRow, CapitalStackBar, CountdownChip, ProgressBar } from "@/src/components/ui";
import Badge from "@/src/components/ui/Badge";
import { fmtPct, fmtBps, fmtMultiple, fmtMonths } from "@/src/lib/utils/format";
import PriceRateChart from "./charts/PriceRateChart";
import VolumeATMTracker from "./VolumeATMTracker";

export default function OverviewView() {
  const { data: snap, isLoading } = useSnapshot();
  const { data: history } = useHistory("3m");

  if (isLoading || !snap) {
    return (
      <div style={{ display: "flex", gap: "var(--card-gap)", flexWrap: "wrap" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ flex: "1 1 150px", height: 88 }} />
        ))}
      </div>
    );
  }

  const s = snap;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPI Strip — 6 cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--card-gap)" }}>
        <KpiCard
          label="STRC Price"
          dotColor="var(--accent)"
          value={`$${s.strc_price.toFixed(2)}`}
          delta={fmtBps(s.strc_par_spread_bps)}
          deltaType={s.strc_par_spread_bps >= 0 ? "up" : "down"}
          footer={`Eff. Yield ${fmtPct(s.strc_effective_yield)}`}
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
          label="mNAV"
          dotColor="var(--amber)"
          value={fmtMultiple(s.mnav)}
          delta={`${s.mnav_30d_trend >= 0 ? "+" : ""}${s.mnav_30d_trend.toFixed(2)} 30d`}
          deltaType={s.mnav_30d_trend >= 0 ? "up" : "down"}
          footer={<Badge variant={s.mnav_regime === "crisis" ? "red" : s.mnav_regime === "tactical" ? "amber" : "green"}>{s.mnav_regime}</Badge>}
        />
        <KpiCard
          label="Bitcoin Price"
          dotColor="var(--btc)"
          value={`$${s.btc_price.toLocaleString()}`}
          delta={`${s.btc_24h_pct >= 0 ? "+" : ""}${s.btc_24h_pct.toFixed(2)}% 24h`}
          deltaType={s.btc_24h_pct >= 0 ? "up" : "down"}
          footer={`${s.btc_holdings.toLocaleString()} BTC held`}
        />
        <KpiCard
          label="BTC Reserve"
          dotColor="var(--btc)"
          value={`$${(s.btc_nav / 1e9).toFixed(1)}B`}
          highlighted
          footer={`${fmtMultiple(s.btc_coverage_ratio)} coverage · Impairment $${(s.btc_impairment_price / 1000).toFixed(1)}K`}
        />
        <KpiCard
          label="USD Reserve"
          dotColor="var(--green)"
          value={`$${(s.usd_reserve / 1e9).toFixed(2)}B`}
          footer={`${fmtMonths(s.usd_coverage_months)} coverage · $${(s.total_annual_obligations / 1e6).toFixed(0)}M/yr obligations`}
        />
      </div>

      {/* Price + Rate chart | Capital Stack */}
      <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: "var(--card-gap)" }}>
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>STRC Price and Rate History</div>
          <div style={{ height: 280 }}>
            <PriceRateChart data={history} />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Capital Stack</div>
          <CapitalStackBar
            segments={[
              { label: "Converts", notional: 8.2e9, color: "var(--t3)", rate: "~0.6%", rank: 1 },
              { label: "STRF", notional: 0.711e9, color: "var(--amber)", rate: "10.0%", rank: 2 },
              { label: "STRC", notional: 3.4e9, color: "var(--accent)", rate: `${s.strc_rate_pct}%`, rank: 3 },
              { label: "STRK", notional: 0.7e9, color: "var(--violet)", rate: "8.0%", rank: 4 },
              { label: "STRD", notional: 1.0e9, color: "var(--red)", rate: "10.0%", rank: 5 },
            ]}
            btcNav={s.btc_nav}
            highlightTicker="STRC"
          />
        </div>
      </div>

      {/* Flywheel metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--card-gap)" }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>BTC Yield YTD</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--green)" }}>{fmtPct(s.btc_yield_ytd * 100, 1)}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>mBTC/share accumulated</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>BTC Dollar Gain YTD</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>${(s.btc_dollar_gain_ytd / 1e9).toFixed(1)}B</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>BTC Conversion Rate</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--amber)" }}>{fmtPct(s.btc_conversion_rate * 100, 0)}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Regime: {s.mnav_regime}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>mNAV Break-Even BTC</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>${s.mnav_breakeven_btc.toLocaleString()}</div>
        </div>
      </div>

      {/* Volume + ATM Issuance Tracker */}
      <VolumeATMTracker />

      {/* Bottom row: BTC Coverage | ATM Utilization | Rate Countdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--card-gap)" }}>
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 10 }}>BTC Coverage</div>
          <StatRow cells={[
            { label: "Coverage Ratio", value: fmtMultiple(s.btc_coverage_ratio), color: s.btc_coverage_ratio > 3 ? "var(--green)" : "var(--amber)" },
            { label: "Impairment Price", value: `$${(s.btc_impairment_price).toLocaleString()}` },
          ]} />
          <div style={{ marginTop: 12 }}>
            <ProgressBar label="LP (Liquidation Preference)" value={`$${s.lp_current.toFixed(2)}`} pct={Math.min(100, (s.lp_current / 110) * 100)} color={s.lp_formula_active ? "var(--accent)" : "var(--t3)"} subtext={s.lp_formula_active ? "ATM active — dynamic formula" : "Static $100"} />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 10 }}>ATM Utilization</div>
          <ProgressBar label="STRC ATM Deployed" value={`$${(s.strc_atm_deployed / 1e9).toFixed(2)}B`} pct={(s.strc_atm_deployed / s.strc_atm_authorized) * 100} color="var(--accent)" subtext={`$${(s.atm_remaining / 1e9).toFixed(2)}B remaining of $${(s.strc_atm_authorized / 1e9).toFixed(1)}B`} />
          <ProgressBar label="ATM 90d Pace" value={`$${(s.atm_pace_90d_monthly / 1e6).toFixed(0)}M/mo`} pct={Math.min(100, (s.atm_pace_90d_monthly / 500_000_000) * 100)} color="var(--violet)" />
        </div>
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 10 }}>Rate Countdown</div>
          <CountdownChip daysUntil={s.days_to_announcement} date="" label="to next rate announcement" />
          <div style={{ marginTop: 12 }}>
            <StatRow cells={[
              { label: "Min Rate Next", value: fmtPct(s.min_rate_next_month), color: "var(--violet)" },
              { label: "SOFR Floor", value: fmtPct(s.sofr_1m_pct), color: "var(--t2)" },
            ]} />
          </div>
          {s.dividend_stopper_active && (
            <div style={{ marginTop: 10 }}>
              <Badge variant="red">DIVIDEND STOPPER ACTIVE</Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
