"use client";

import { ProgressBar } from "@/src/components/ui";
import Badge from "@/src/components/ui/Badge";
import {
  SATA_NOTIONAL,
  SATA_ANNUAL_DIVIDEND,
  SATA_MONTHLY_DIVIDEND,
  SATA_ISSUANCE_FLOOR,
  SEMLER_CONVERT_NOTES,
  STRC_TREASURY_POSITION,
  SATA_CASH_RESERVE_MONTHS,
} from "@/src/lib/data/sata-capital-structure";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  snap: any;
}

export default function SataRiskAnalysisSection({ snap }: Props) {
  const s = snap;

  return (
    <section id="sata-risk" className="section-anchor">
      <div className="section-header">Risk Analysis</div>

      {/* Dividend Defense */}
      <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12, marginTop: 8 }}>Dividend Defense Waterfall</div>
      <div className="defense-grid" style={{ marginBottom: 20 }}>

        {/* First Defense: Follow-On Offerings */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Badge variant="violet">1st Defense</Badge>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Follow-On Offerings</span>
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 10 }}>
            Strive covers dividend obligations by issuing new SATA shares via discrete follow-on offerings (not continuous ATM). Issuance floor: $100 par.
          </div>

          {(() => {
            const annualObl = SATA_ANNUAL_DIVIDEND;
            const monthlyObl = SATA_MONTHLY_DIVIDEND;
            const sataPrice = s.sata_price ?? 0;
            const isAboveFloor = sataPrice >= SATA_ISSUANCE_FLOOR;
            const sharesToCover1yr = sataPrice > 0 ? Math.ceil(annualObl / sataPrice) : 0;
            const sharesToCoverMonthly = sataPrice > 0 ? Math.ceil(monthlyObl / sataPrice) : 0;

            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Annual Dividend Obligation</span>
                  <span className="mono" style={{ fontWeight: 600 }}>${(annualObl / 1e6).toFixed(1)}M/yr</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Monthly Obligation</span>
                  <span className="mono" style={{ fontWeight: 600 }}>${(monthlyObl / 1e6).toFixed(1)}M/mo</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>SATA Price</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{sataPrice > 0 ? `$${sataPrice.toFixed(2)}` : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Issuance Floor</span>
                  <span className="mono" style={{ fontWeight: 600 }}>$100.00</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Can Issue Now?</span>
                  <Badge variant={isAboveFloor ? "green" : "red"}>
                    {isAboveFloor ? "YES — Above Floor" : "NO — Below Floor"}
                  </Badge>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Shares to Cover 1 Month</span>
                  <span className="mono" style={{ fontWeight: 600, color: "var(--violet)" }}>{sharesToCoverMonthly > 0 ? sharesToCoverMonthly.toLocaleString() : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)" }}>
                  <span style={{ color: "var(--t2)" }}>Shares to Cover 1 Year</span>
                  <span className="mono" style={{ fontWeight: 600, color: "var(--violet)" }}>{sharesToCover1yr > 0 ? sharesToCover1yr.toLocaleString() : "—"}</span>
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 8, fontStyle: "italic" }}>
                  Note: Strive guidance is to issue SATA within $99-$101 range only (tight around par).
                </div>
              </>
            );
          })()}
        </div>

        {/* Second Defense: Cash + STRC Reserves */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Badge variant="green">2nd Defense</Badge>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Cash + STRC Reserves</span>
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 10 }}>
            Strive maintains dual reserve pools: cash reserves (12 months) and a $50M STRC treasury position (6 months) providing 18 months total dividend coverage.
          </div>

          {(() => {
            const cashReserve = s.cash_reserve ?? (SATA_MONTHLY_DIVIDEND * SATA_CASH_RESERVE_MONTHS);
            const cashMonths = s.cash_reserve_months ?? SATA_CASH_RESERVE_MONTHS;
            const strcValue = s.strc_reserve_value ?? STRC_TREASURY_POSITION;
            const strcMonths = s.strc_reserve_months ?? 6;
            const totalMonths = s.total_reserve_months ?? 18;
            const monthlyObl = SATA_MONTHLY_DIVIDEND;
            const totalYears = totalMonths / 12;

            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Cash Reserve</span>
                  <span className="mono" style={{ fontWeight: 600 }}>${(cashReserve / 1e6).toFixed(1)}M ({cashMonths} mo)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>STRC Treasury Position</span>
                  <span className="mono" style={{ fontWeight: 600, color: "var(--accent)" }}>${(strcValue / 1e6).toFixed(1)}M ({strcMonths.toFixed(0)} mo)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t2)" }}>Monthly Dividend</span>
                  <span className="mono" style={{ fontWeight: 600 }}>${(monthlyObl / 1e6).toFixed(1)}M/mo</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "var(--text-sm)" }}>
                  <span style={{ color: "var(--t2)", fontWeight: 600 }}>Total Reserve Runway</span>
                  <span className="mono" style={{ fontWeight: 700, fontSize: "var(--text-md)", color: totalMonths > 12 ? "var(--green)" : totalMonths > 6 ? "var(--amber)" : "var(--red)" }}>
                    {totalMonths.toFixed(0)} months
                  </span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    label="Dividend Reserve Coverage"
                    value={`${totalYears.toFixed(1)}yr`}
                    pct={Math.min(100, (totalMonths / 24) * 100)}
                    color={totalMonths > 12 ? "var(--green)" : totalMonths > 6 ? "var(--amber)" : "var(--red)"}
                  />
                </div>

                {/* Cross-instrument dependency */}
                <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--amber)" }}>Cross-Instrument Risk:</div>
                  <div>STRC reserve value depends on STRC market price. A decline in STRC price reduces SATA&apos;s effective reserve runway.</div>
                  {s.strc_price != null && (
                    <div style={{ marginTop: 4 }}>
                      Current STRC: <span className="mono" style={{ fontWeight: 600 }}>${s.strc_price.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Depletion timeline */}
                <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 10 }}>Reserve depletion (no new issuance):</div>
                {[3, 6, 12, 15, 18].filter((m) => m <= Math.ceil(totalMonths) + 3).map((m) => {
                  const totalReserve = cashReserve + strcValue;
                  const remaining = Math.max(0, totalReserve - monthlyObl * m);
                  const depleted = remaining === 0;
                  return (
                    <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "var(--text-sm)" }}>
                      <span style={{ color: "var(--t2)" }}>{m} months</span>
                      <span className="mono" style={{ fontWeight: 600, color: depleted ? "var(--red)" : remaining < totalReserve * 0.25 ? "var(--amber)" : "var(--green)" }}>
                        {depleted ? "Depleted" : `$${(remaining / 1e6).toFixed(1)}M`}
                      </span>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      </div>

      {/* Structural Notes */}
      <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Capital Structure Notes</div>
      <div className="defense-grid">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>Semler Convertible Notes</div>
          <Badge variant={SEMLER_CONVERT_NOTES <= 10_000_000 ? "green" : "amber"}>
            ${(SEMLER_CONVERT_NOTES / 1e6).toFixed(0)}M Remaining
          </Badge>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 6 }}>
            Targeting full retirement by April 2026. Legacy Semler Scientific debt.
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>Issuance Discipline</div>
          <Badge variant="blue">$99–$101 Floor</Badge>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 6 }}>
            Strive will not issue SATA below $100 par. Guidance: tight $99–$101 range for new offerings.
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6 }}>Offering Structure</div>
          <Badge variant="blue">Discrete Follow-On</Badge>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 6 }}>
            Unlike Strategy&apos;s continuous ATM, Strive uses discrete follow-on offerings for SATA issuance.
          </div>
        </div>
      </div>
    </section>
  );
}
