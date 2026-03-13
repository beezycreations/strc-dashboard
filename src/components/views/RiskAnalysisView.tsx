"use client";

import { useSnapshot, useHistory } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";
import { ProgressBar, StatRow } from "@/src/components/ui";
import { fmtPct, fmtMultiple, fmtMonths } from "@/src/lib/utils/format";

export default function RiskAnalysisView() {
  const { data: snap, isLoading } = useSnapshot();
  const { data: history } = useHistory("3m");

  if (isLoading || !snap) {
    return <div style={{ display: "flex", gap: "var(--card-gap)", flexWrap: "wrap" }}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ flex: "1 1 300px", height: 200 }} />)}</div>;
  }

  const s = snap;

  // Risk status summary
  const riskCards = [
    { status: s.usd_coverage_months > 12 ? "safe" : s.usd_coverage_months > 6 ? "watch" : "alert" },
    { status: s.btc_coverage_ratio > 3 ? "safe" : s.btc_coverage_ratio > 2 ? "watch" : "alert" },
    { status: s.mnav > 1.5 ? "safe" : s.mnav > 1.0 ? "watch" : "alert" },
    { status: s.btc_coverage_ratio > 2 ? "safe" : "watch" },
    { status: s.strc_rate_pct > 8 ? "safe" : "watch" },
    { status: s.atm_remaining > 1.5e9 ? "safe" : s.atm_remaining > 1e9 ? "watch" : "alert" },
  ] as const;

  const safeCount = riskCards.filter((r) => r.status === "safe").length;
  const watchCount = riskCards.filter((r) => r.status === "watch").length;
  const alertCount = riskCards.filter((r) => r.status === "alert").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Risk summary badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Risk Dimensions</span>
        <Badge variant="green">{safeCount} Safe</Badge>
        {watchCount > 0 && <Badge variant="amber">{watchCount} Watch</Badge>}
        {alertCount > 0 && <Badge variant="red">{alertCount} Alert</Badge>}
      </div>

      {/* 3×2 Risk cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--card-gap)" }}>
        {/* 1. Dividend Coverage */}
        <RiskCard title="Dividend Coverage" status={riskCards[0].status}>
          <ProgressBar
            label="USD Reserve Coverage"
            value={fmtMonths(s.usd_coverage_months)}
            pct={Math.min(100, (s.usd_coverage_months / 36) * 100)}
            color={s.usd_coverage_months > 12 ? "var(--green)" : "var(--amber)"}
            subtext={`$${(s.usd_reserve / 1e9).toFixed(2)}B reserve · $${(s.total_annual_obligations / 1e6).toFixed(0)}M/yr`}
          />
          <ProgressBar
            label="ATM Runway"
            value={s.mnav > 1 ? `~${Math.min(36, Math.round((s.atm_remaining + s.usd_reserve) / (s.total_annual_obligations / 12)))} mo` : "N/A"}
            pct={s.mnav > 1 ? 70 : 0}
            color="var(--violet)"
            subtext={s.mnav <= 1 ? "ATM issuance not viable at mNAV ≤ 1.0×" : undefined}
          />
        </RiskCard>

        {/* 2. BTC Collateral Coverage */}
        <RiskCard title="BTC Collateral" status={riskCards[1].status}>
          <StatRow cells={[
            { label: "Current", value: fmtMultiple(s.btc_coverage_ratio), color: "var(--green)" },
            { label: "Impairment", value: `$${(s.btc_impairment_price).toLocaleString()}` },
          ]} />
          <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--t3)" }}>
            Stress scenarios:
          </div>
          {[
            { label: "-30%", btc: s.btc_price * 0.7, cov: s.btc_coverage_ratio * 0.7 },
            { label: "-50%", btc: s.btc_price * 0.5, cov: s.btc_coverage_ratio * 0.5 },
            { label: "-70%", btc: s.btc_price * 0.3, cov: s.btc_coverage_ratio * 0.3 },
          ].map((sc) => (
            <div key={sc.label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "var(--text-sm)" }}>
              <span style={{ color: "var(--t2)" }}>BTC {sc.label} (${(sc.btc / 1000).toFixed(0)}K)</span>
              <span className="mono" style={{ fontWeight: 600, color: sc.cov > 2 ? "var(--green)" : sc.cov > 1 ? "var(--amber)" : "var(--red)" }}>
                {fmtMultiple(sc.cov)}
              </span>
            </div>
          ))}
        </RiskCard>

        {/* 3. mNAV Sustainability */}
        <RiskCard title="mNAV Sustainability" status={riskCards[2].status}>
          <StatRow cells={[
            { label: "Current mNAV", value: fmtMultiple(s.mnav), color: s.mnav > 1.5 ? "var(--green)" : "var(--amber)" },
            { label: "30d Trend", value: `${s.mnav_30d_trend >= 0 ? "+" : ""}${s.mnav_30d_trend.toFixed(3)}`, color: s.mnav_30d_trend >= 0 ? "var(--green)" : "var(--red)" },
          ]} />
          <div style={{ marginTop: 10 }}>
            <ProgressBar label="mNAV Position" value={s.mnav_regime} pct={Math.min(100, (s.mnav / 4) * 100)} color="var(--amber)" />
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 4 }}>
            Break-even BTC: ${s.mnav_breakeven_btc.toLocaleString()} ({fmtPct(((s.mnav_breakeven_btc - s.btc_price) / s.btc_price) * 100, 1)} from spot)
          </div>
        </RiskCard>

        {/* 4. Liquidation Recovery */}
        <RiskCard title="Liquidation Recovery" status={riskCards[3].status}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--t2)", marginBottom: 8 }}>
            STRC recovery estimate in wind-down
          </div>
          {[100, 75, 50, 25].map((pctBtc) => {
            const btcVal = s.btc_holdings * s.btc_price * (pctBtc / 100);
            const seniorClaims = 8.2e9 + 0.711e9 + 3.4e9;
            const recovery = Math.min(1, Math.max(0, (btcVal - 8.2e9 - 0.711e9) / 3.4e9));
            return (
              <div key={pctBtc} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--t2)" }}>BTC @ {pctBtc}% spot</span>
                <span className="mono" style={{ fontWeight: 600, color: recovery > 0.9 ? "var(--green)" : recovery > 0.5 ? "var(--amber)" : "var(--red)" }}>
                  {fmtPct(recovery * 100, 0)} recovery
                </span>
              </div>
            );
          })}
        </RiskCard>

        {/* 5. Rate Reset Risk */}
        <RiskCard title="Rate Reset Risk" status={riskCards[4].status}>
          <StatRow cells={[
            { label: "Current Rate", value: fmtPct(s.strc_rate_pct), color: "var(--violet)" },
            { label: "SOFR Floor", value: fmtPct(s.sofr_1m_pct) },
          ]} />
          <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--t3)" }}>
            Minimum rate floor projection (25bps/mo max cut):
          </div>
          {[3, 6, 12].map((m) => (
            <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "var(--text-sm)" }}>
              <span style={{ color: "var(--t2)" }}>{m}mo out</span>
              <span className="mono" style={{ fontWeight: 600 }}>{fmtPct(Math.max(s.sofr_1m_pct, s.strc_rate_pct - m * 0.25))}</span>
            </div>
          ))}
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 6 }}>
            {Math.ceil((s.strc_rate_pct - s.sofr_1m_pct) / 0.25)} months to reach SOFR floor at max reduction pace
          </div>
        </RiskCard>

        {/* 6. ATM Pace */}
        <RiskCard title="ATM Pace vs BTC" status={riskCards[5].status}>
          <StatRow cells={[
            { label: "STRC ATM Remaining", value: `$${(s.atm_remaining / 1e9).toFixed(2)}B` },
            { label: "90d Pace", value: `$${(s.atm_pace_90d_monthly / 1e6).toFixed(0)}M/mo` },
          ]} />
          <ProgressBar
            label="ATM Utilization"
            value={fmtPct((s.strc_atm_deployed / s.strc_atm_authorized) * 100, 1)}
            pct={(s.strc_atm_deployed / s.strc_atm_authorized) * 100}
            color={s.atm_remaining < 500e6 ? "var(--red)" : "var(--accent)"}
          />
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 4 }}>
            At current pace: ~{Math.round(s.atm_remaining / s.atm_pace_90d_monthly)} months until program exhausted
          </div>
        </RiskCard>
      </div>

      {/* Structural Protections */}
      <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginTop: 8 }}>Structural Protections</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--card-gap)" }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>Dividend Stopper</div>
          <Badge variant={s.dividend_stopper_active ? "red" : "green"}>
            {s.dividend_stopper_active ? "ACTIVE — Junior distributions blocked" : "INACTIVE — All dividends current"}
          </Badge>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 6 }}>
            Blocks STRK, STRD, and MSTR common dividends/buybacks if STRC unpaid
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>Fundamental Change Put</div>
          <Badge variant="blue">Protected</Badge>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 6 }}>
            Put right at LP + accrued on &gt;50% control change. Saylor carve-out: Permitted Party exception applies.
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>Voting + Redemption</div>
          <Badge variant="blue">Standard</Badge>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 6 }}>
            STRC+STRF vote as class on senior issuance, CoD amendments. Optional / clean-up / tax redemption at LP + accrued.
          </div>
        </div>
      </div>
    </div>
  );
}

function RiskCard({ title, status, children }: { title: string; status: "safe" | "watch" | "alert"; children: React.ReactNode }) {
  const variant = status === "safe" ? "green" : status === "watch" ? "amber" : "red";
  const label = status.toUpperCase();
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{title}</span>
        <Badge variant={variant}>{label}</Badge>
      </div>
      {children}
    </div>
  );
}
