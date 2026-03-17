"use client";

import { ProgressBar, StatRow, RiskCard } from "@/src/components/ui";
import Badge from "@/src/components/ui/Badge";
import { fmtPct, fmtMultiple, fmtMonths } from "@/src/lib/utils/format";
import { CONVERT_DEBT_USD, PREF_BASE, ANNUAL_OBLIGATIONS, INSTRUMENT_OBLIGATIONS, ATM_AUTHORIZED, MSTR_SHARES_AT_FILING } from "@/src/lib/data/capital-structure";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  snap: any;
  history: any;
}

export default function RiskAnalysisSection({ snap, history }: Props) {
  const s = snap;

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
    <section id="strc-risk" className="section-anchor">
      <div className="section-header">
        Risk Analysis
        <span style={{ marginLeft: 12, display: "inline-flex", gap: 8 }}>
          <Badge variant="green">{safeCount} Safe</Badge>
          {watchCount > 0 && <Badge variant="amber">{watchCount} Watch</Badge>}
          {alertCount > 0 && <Badge variant="red">{alertCount} Alert</Badge>}
        </span>
      </div>

      {/* 3×2 Risk cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--card-gap)", marginBottom: 20 }}>
        {/* 1. Dividend Coverage */}
        <RiskCard
          title="Dividend Coverage"
          status={riskCards[0].status}
          methodology={<>
            <p><strong style={{ color: "var(--t2)" }}>USD Reserve Coverage</strong> = Cash &amp; equivalents / annual dividend obligations.</p>
            <p><strong style={{ color: "var(--t2)" }}>Signal thresholds</strong>: Safe &gt; 12 months, Watch 6–12, Alert &lt; 6.</p>
          </>}
        >
          <ProgressBar
            label="USD Reserve Coverage"
            value={s.usd_coverage_months != null ? fmtMonths(s.usd_coverage_months) : "—"}
            pct={s.usd_coverage_months != null ? Math.min(100, (s.usd_coverage_months / 36) * 100) : 0}
            color={s.usd_coverage_months != null && s.usd_coverage_months > 12 ? "var(--green)" : "var(--amber)"}
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
            { label: "Impairment", value: s.btc_impairment_price != null ? `$${(s.btc_impairment_price).toLocaleString()}` : "—" },
          ]} />
          <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--t3)" }}>Stress scenarios:</div>
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
        <RiskCard
          title="mNAV Sustainability"
          status={riskCards[2].status}
          methodology={<>
            <p><strong style={{ color: "var(--t2)" }}>mNAV</strong> = Enterprise Value / BTC Reserve. EV = MSTR market cap + convertible debt + preferred notional − cash.</p>
            <p><strong style={{ color: "var(--t2)" }}>Signal thresholds</strong>: Safe &gt; 1.5×, Watch 1.0–1.5×, Alert &lt; 1.0×.</p>
          </>}
        >
          <StatRow cells={[
            { label: "Current mNAV", value: fmtMultiple(s.mnav), color: s.mnav > 1.5 ? "var(--green)" : "var(--amber)" },
            { label: "30d Trend", value: s.mnav_30d_trend != null ? `${s.mnav_30d_trend >= 0 ? "+" : ""}${s.mnav_30d_trend.toFixed(3)}` : "—", color: s.mnav_30d_trend != null && s.mnav_30d_trend >= 0 ? "var(--green)" : "var(--red)" },
          ]} />
          <div style={{ marginTop: 10 }}>
            <ProgressBar label="mNAV Position" value={s.mnav_regime} pct={Math.min(100, (s.mnav / 4) * 100)} color="var(--amber)" />
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 4 }}>
            Break-even BTC: {s.mnav_breakeven_btc != null ? `$${s.mnav_breakeven_btc.toLocaleString()} (${fmtPct(((s.mnav_breakeven_btc - s.btc_price) / s.btc_price) * 100, 1)} from spot)` : "—"}
          </div>
        </RiskCard>

        {/* 4. Liquidation Recovery */}
        <RiskCard
          title="Liquidation Recovery"
          status={riskCards[3].status}
          methodology={<>
            <p><strong style={{ color: "var(--t2)" }}>Recovery model</strong>: Simulates wind-down with BTC liquidated at various prices. Proceeds distributed per seniority waterfall.</p>
            <p><strong style={{ color: "var(--t2)" }}>Waterfall</strong>: (1) Converts ${`$${(CONVERT_DEBT_USD / 1e9).toFixed(1)}B`}, (2) STRF ${`$${(PREF_BASE.STRF / 1e9).toFixed(2)}B`}, (3) STRC ${s.strc_atm_deployed ? `$${(s.strc_atm_deployed / 1e9).toFixed(1)}B` : "notional"}, (4) STRK ${`$${(PREF_BASE.STRK / 1e9).toFixed(1)}B`}, (5) STRD ${`$${(PREF_BASE.STRD / 1e9).toFixed(1)}B`}, (6) MSTR equity.</p>
          </>}
        >
          <div style={{ fontSize: "var(--text-sm)", color: "var(--t2)", marginBottom: 8 }}>STRC recovery estimate in wind-down</div>
          {[100, 75, 50, 25].map((pctBtc) => {
            // Waterfall: (1) Converts (2) STRF (3) STRC — amounts from snapshot or capital structure constants
            const convertDebt = CONVERT_DEBT_USD;
            const strfNotional = PREF_BASE.STRF;
            const strcNotional = s.strc_atm_deployed ?? PREF_BASE.STRC;
            const btcVal = s.btc_holdings * s.btc_price * (pctBtc / 100);
            const recovery = strcNotional > 0
              ? Math.min(1, Math.max(0, (btcVal - convertDebt - strfNotional) / strcNotional))
              : 0;
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
        <RiskCard
          title="Rate Reset Risk"
          status={riskCards[4].status}
          methodology={<>
            <p><strong style={{ color: "var(--t2)" }}>STRC rate</strong> = SOFR 1M + spread, reset monthly. Max reduction 25bps/month.</p>
            <p><strong style={{ color: "var(--t2)" }}>Signal</strong>: Safe &gt; 8%, Watch 5–8%, Alert &lt; 5%.</p>
          </>}
        >
          <StatRow cells={[
            { label: "Current Rate", value: fmtPct(s.strc_rate_pct), color: "var(--violet)" },
            { label: "SOFR Floor", value: fmtPct(s.sofr_1m_pct) },
          ]} />
          <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--t3)" }}>Rate floor projection (25bps/mo max cut):</div>
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
        <RiskCard
          title="ATM Pace vs BTC"
          status={riskCards[5].status}
          methodology={<>
            <p><strong style={{ color: "var(--t2)" }}>ATM program</strong>: Continuous share issuance at market price. Proceeds fund BTC purchases.</p>
            <p><strong style={{ color: "var(--t2)" }}>Signal</strong>: Safe &gt; $1.5B remaining, Watch $1.0–1.5B, Alert &lt; $1.0B.</p>
          </>}
        >
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

      {/* ── Dividend Defense ── */}
      <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12, marginTop: 8 }}>Dividend Defense Waterfall</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--card-gap)", marginBottom: 20 }}>

        {/* First Defense: ATM Issuance */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Badge variant="violet">1st Defense</Badge>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>ATM Share Issuance</span>
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 10 }}>
            Strategy covers dividend obligations primarily by issuing MSTR shares via ATM programs. At the current MSTR price, here is how many shares are needed:
          </div>

          {/* Shares needed breakdown */}
          {(() => {
            const mstrPrice = s.mstr_price ?? 0;
            const annualObl = s.total_annual_obligations || ANNUAL_OBLIGATIONS;
            const monthlyObl = annualObl / 12;
            const mstrAtmRemaining = (s.mstr_atm_authorized ?? ATM_AUTHORIZED.MSTR) - (s.mstr_atm_deployed_est ?? 0);

            const sharesToCover1yr = mstrPrice > 0 ? Math.ceil(annualObl / mstrPrice) : 0;
            const sharesToCoverMonthly = mstrPrice > 0 ? Math.ceil(monthlyObl / mstrPrice) : 0;
            const atmCapacityShares = mstrPrice > 0 ? Math.floor(mstrAtmRemaining / mstrPrice) : 0;
            const atmCoverageYears = mstrPrice > 0 && annualObl > 0 ? mstrAtmRemaining / annualObl : 0;

            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Annual Obligations</span>
                  <span className="mono" style={{ fontWeight: 600 }}>${(annualObl / 1e6).toFixed(0)}M/yr</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>MSTR Price</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{mstrPrice > 0 ? `$${mstrPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Shares to Cover 1 Month</span>
                  <span className="mono" style={{ fontWeight: 600, color: "var(--violet)" }}>{sharesToCoverMonthly > 0 ? sharesToCoverMonthly.toLocaleString() : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Shares to Cover 1 Year</span>
                  <span className="mono" style={{ fontWeight: 600, color: "var(--violet)" }}>{sharesToCover1yr > 0 ? sharesToCover1yr.toLocaleString() : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>MSTR ATM Remaining</span>
                  <span className="mono" style={{ fontWeight: 600 }}>${(mstrAtmRemaining / 1e9).toFixed(2)}B</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>ATM Capacity (shares)</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{atmCapacityShares > 0 ? atmCapacityShares.toLocaleString() : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "var(--text-sm)" }}>
                  <span style={{ color: "var(--t2)", fontWeight: 600 }}>ATM Dividend Coverage</span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: "var(--text-md)", color: atmCoverageYears > 5 ? "var(--green)" : atmCoverageYears > 2 ? "var(--amber)" : "var(--red)" }}>
                    {atmCoverageYears > 0 ? `${atmCoverageYears.toFixed(1)} years` : "—"}
                  </span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    label="ATM Dividend Runway"
                    value={atmCoverageYears > 0 ? `${atmCoverageYears.toFixed(1)}yr` : "—"}
                    pct={Math.min(100, (atmCoverageYears / 10) * 100)}
                    color={atmCoverageYears > 5 ? "var(--green)" : atmCoverageYears > 2 ? "var(--amber)" : "var(--red)"}
                  />
                </div>
              </>
            );
          })()}

          {/* Implied dilution to MSTR common equity */}
          {(() => {
            const mstrPrice = s.mstr_price ?? 0;
            const annualObl = s.total_annual_obligations || ANNUAL_OBLIGATIONS;
            const mstrShares = MSTR_SHARES_AT_FILING;
            const sharesToCover1yr = mstrPrice > 0 ? Math.ceil(annualObl / mstrPrice) : 0;
            const annualDilutionPct = mstrShares > 0 && sharesToCover1yr > 0
              ? (sharesToCover1yr / mstrShares) * 100 : 0;

            return (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--t2)", marginBottom: 6 }}>Implied MSTR Dilution</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>MSTR Shares Outstanding</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{(mstrShares / 1e6).toFixed(1)}M</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>New Shares for 1yr Dividends</span>
                  <span className="mono" style={{ fontWeight: 600, color: "var(--red)" }}>{sharesToCover1yr > 0 ? `${(sharesToCover1yr / 1e6).toFixed(2)}M` : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Annual Dilution %</span>
                  <span className="mono" style={{ fontWeight: 700, color: annualDilutionPct < 2 ? "var(--green)" : annualDilutionPct < 5 ? "var(--amber)" : "var(--red)" }}>
                    {annualDilutionPct > 0 ? fmtPct(annualDilutionPct, 2) : "—"}
                  </span>
                </div>
                {/* Multi-year dilution projection */}
                <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 6 }}>Cumulative dilution at current price:</div>
                {[1, 3, 5].map((yr) => {
                  const cumShares = mstrShares + sharesToCover1yr * yr;
                  const cumDilution = mstrShares > 0 ? ((cumShares - mstrShares) / mstrShares) * 100 : 0;
                  return (
                    <div key={yr} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "var(--text-sm)" }}>
                      <span style={{ color: "var(--t2)" }}>{yr}yr ({(cumShares / 1e6).toFixed(0)}M shares)</span>
                      <span className="mono" style={{ fontWeight: 600, color: cumDilution < 5 ? "var(--green)" : cumDilution < 10 ? "var(--amber)" : "var(--red)" }}>
                        {cumDilution > 0 ? fmtPct(cumDilution, 1) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Per-instrument obligations breakdown */}
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Obligation Breakdown:</div>
            {Object.entries(INSTRUMENT_OBLIGATIONS).map(([name, amt]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>{name}</span>
                <span className="mono">${(amt / 1e6).toFixed(0)}M/yr</span>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* Structural Protections */}
      <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Structural Protections</div>
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
    </section>
  );
}
