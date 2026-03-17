"use client";

import { ProgressBar, StatRow } from "@/src/components/ui";
import Badge from "@/src/components/ui/Badge";
import { fmtPct } from "@/src/lib/utils/format";
import { CASH_BALANCE, ANNUAL_OBLIGATIONS, INSTRUMENT_OBLIGATIONS, ATM_AUTHORIZED, MSTR_SHARES_AT_FILING } from "@/src/lib/data/capital-structure";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  snap: any;
  history: any;
}

export default function RiskAnalysisSection({ snap, history }: Props) {
  const s = snap;

  return (
    <section id="strc-risk" className="section-anchor">
      <div className="section-header">Risk Analysis</div>

      {/* ── Dividend Defense ── */}
      <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12, marginTop: 8 }}>Dividend Defense Waterfall</div>
      <div className="defense-grid" style={{ marginBottom: 20 }}>

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

        {/* Second Defense: Cash Reserves */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Badge variant="green">2nd Defense</Badge>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Cash Reserves</span>
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 10 }}>
            If ATM issuance is halted (mNAV &lt; 1.0×), Strategy&apos;s cash reserves provide a backstop to continue paying dividend obligations without selling BTC.
          </div>

          {(() => {
            const cashReserve = s.usd_reserve ?? CASH_BALANCE;
            const annualObl = s.total_annual_obligations || ANNUAL_OBLIGATIONS;
            const monthlyObl = annualObl / 12;
            const coverageYears = annualObl > 0 ? cashReserve / annualObl : 0;
            const coverageMonths = annualObl > 0 ? cashReserve / monthlyObl : 0;

            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Cash & Equivalents</span>
                  <span className="mono" style={{ fontWeight: 600 }}>${(cashReserve / 1e9).toFixed(2)}B</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Annual Obligations</span>
                  <span className="mono" style={{ fontWeight: 600 }}>${(annualObl / 1e6).toFixed(0)}M/yr</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Monthly Burn Rate</span>
                  <span className="mono" style={{ fontWeight: 600 }}>${(monthlyObl / 1e6).toFixed(0)}M/mo</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "var(--text-sm)" }}>
                  <span style={{ color: "var(--t2)", fontWeight: 600 }}>Cash Runway</span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: "var(--text-md)", color: coverageYears > 2 ? "var(--green)" : coverageYears > 1 ? "var(--amber)" : "var(--red)" }}>
                    {coverageYears > 0 ? `${coverageYears.toFixed(1)} years` : "—"}
                  </span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    label="Cash Dividend Coverage"
                    value={coverageYears > 0 ? `${coverageYears.toFixed(1)}yr` : "—"}
                    pct={Math.min(100, (coverageYears / 5) * 100)}
                    color={coverageYears > 2 ? "var(--green)" : coverageYears > 1 ? "var(--amber)" : "var(--red)"}
                  />
                </div>

                {/* Depletion timeline */}
                <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 10 }}>Cash depletion schedule (no ATM issuance):</div>
                {[6, 12, 18, 24, 30].filter((m) => m <= Math.ceil(coverageMonths) + 6).map((m) => {
                  const remaining = Math.max(0, cashReserve - monthlyObl * m);
                  const depleted = remaining === 0;
                  return (
                    <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "var(--text-sm)" }}>
                      <span style={{ color: "var(--t2)" }}>{m} months</span>
                      <span className="mono" style={{ fontWeight: 600, color: depleted ? "var(--red)" : remaining < cashReserve * 0.25 ? "var(--amber)" : "var(--green)" }}>
                        {depleted ? "Depleted" : `$${(remaining / 1e9).toFixed(2)}B`}
                      </span>
                    </div>
                  );
                })}

                <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 10, fontStyle: "italic" }}>
                  Source: Strategy Q4 2025 earnings — &quot;$2.25B provides ~2.5 years of dividend coverage&quot;
                </div>
              </>
            );
          })()}
        </div>
      </div>


      {/* Structural Protections */}
      <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Structural Protections</div>
      <div className="defense-grid">
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
