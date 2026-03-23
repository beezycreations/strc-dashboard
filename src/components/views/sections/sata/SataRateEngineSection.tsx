"use client";

import Badge from "@/src/components/ui/Badge";
import { fmtPct } from "@/src/lib/utils/format";
import { SATA_RATE_PCT, SATA_PAR, TAX_BRACKETS } from "@/src/lib/data/sata-capital-structure";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Legend,
} from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  snap: any;
  history: any;
}

export default function SataRateEngineSection({ snap, history }: Props) {
  const s = snap;
  const rates = history?.rates ?? [];
  const sofrForward = history?.sofr_forward ?? [];
  const dividends = history?.dividends ?? [];

  // Monthly dividend per share
  const monthlyDiv = (SATA_RATE_PCT / 12 / 100) * SATA_PAR;

  // Rate floor projection (12 months)
  const sofrPct = rates.length > 0 ? (rates[rates.length - 1].sofr_1m_pct ?? 4.3) : 4.3;
  const spread = SATA_RATE_PCT - sofrPct;
  const projectionData = Array.from({ length: 13 }, (_, m) => {
    const bearSofr = sofrPct + m * (0.5 / 12);
    const baseSofr = Math.max(0, sofrPct - m * (1.0 / 12));
    const bullSofr = Math.max(0, sofrPct - m * (2.5 / 12));
    return {
      month: m,
      bear: parseFloat((bearSofr + spread).toFixed(2)),
      base: parseFloat((baseSofr + spread).toFixed(2)),
      bull: parseFloat((bullSofr + spread).toFixed(2)),
    };
  });

  const allProjectionValues = projectionData.flatMap((d) => [d.bear, d.base, d.bull]);
  const projYMin = Math.floor(Math.min(...allProjectionValues) - 0.5);
  const projYMax = Math.ceil(Math.max(...allProjectionValues) + 0.5);

  return (
    <section id="sata-rate" className="section-anchor">
      <div className="section-header">
        Rate Engine
        <span style={{ marginLeft: 12, display: "inline-flex", gap: 8 }}>
          <span className="badge badge-violet">{fmtPct(SATA_RATE_PCT)} Current</span>
          <span className="badge badge-blue">SOFR {fmtPct(sofrPct)}</span>
        </span>
      </div>

      {/* Monthly dividend calc */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Current Rate</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--violet)" }}>{fmtPct(SATA_RATE_PCT)}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Variable · Monthly payout</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Monthly Dividend/Share</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--green)" }}>${monthlyDiv.toFixed(2)}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>$100 par × {SATA_RATE_PCT}% / 12</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>SOFR Spread</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--amber)" }}>{spread.toFixed(2)}%</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>SATA Rate − SOFR 1M</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Tax-Equiv. Yield (37%)</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--green)" }}>
            {TAX_BRACKETS[TAX_BRACKETS.length - 1].taxEquivYield.toFixed(2)}%
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>ROC treatment</div>
        </div>
      </div>

      {/* Rate History chart */}
      {rates.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Rate History</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rates} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: string) => v.slice(2, 7)} interval="preserveStartEnd" />
                <YAxis domain={[0, 16]} tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={rechartsDefaults.tooltipStyle} />
                <Line type="stepAfter" dataKey="sata_rate_pct" name="SATA Rate" stroke={colors.violet} strokeWidth={2} dot={false} />
                <Line type="stepAfter" dataKey="sofr_1m_pct" name="SOFR 1M" stroke={colors.accent} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Dividend Schedule */}
      {dividends.length > 0 && (
        <div className="card" style={{ overflowX: "auto", marginBottom: 20 }}>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Dividend Schedule</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                {["Dividend Period", "Record Date", "Payout Date", "Rate", "Dividend/Share"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--t3)", fontWeight: 500, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dividends.map((d: { period: string; periodSort: string; recordDate: string; payoutDate: string; ratePct: number; dividendPerShare: number; isCurrent: boolean }) => (
                <tr key={d.periodSort} style={{ borderBottom: "1px solid var(--border)", color: d.isCurrent ? "var(--accent)" : "var(--t1)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{d.period}</td>
                  <td className="mono" style={{ padding: "8px 12px" }}>{d.recordDate}</td>
                  <td className="mono" style={{ padding: "8px 12px" }}>{d.payoutDate}</td>
                  <td className="mono" style={{ padding: "8px 12px", fontWeight: 600 }}>{d.ratePct.toFixed(2)}%</td>
                  <td className="mono" style={{ padding: "8px 12px", fontWeight: 600 }}>${d.dividendPerShare.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Spread over SOFR */}
      {rates.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>
            Spread over SOFR
            <span className="mono" style={{ marginLeft: 8, fontSize: "var(--text-sm)", color: "var(--amber)", fontWeight: 600 }}>
              {spread.toFixed(2)}% current
            </span>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={rates.map((r: { date: string; sata_rate_pct: number; sofr_1m_pct: number | null }) => ({
                  ...r,
                  spread: r.sofr_1m_pct != null ? parseFloat((r.sata_rate_pct - r.sofr_1m_pct).toFixed(2)) : null,
                }))}
                margin={{ top: 5, right: 20, bottom: 5, left: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: string) => v.slice(2, 7)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={rechartsDefaults.tooltipStyle} />
                <Legend
                  verticalAlign="top" align="right"
                  wrapperStyle={{ fontSize: 11, fontFamily: rechartsDefaults.fontFamily, paddingBottom: 8 }}
                />
                <Line type="stepAfter" dataKey="sata_rate_pct" name="SATA Rate" stroke={colors.violet} strokeWidth={1.5} dot={false} opacity={0.4} />
                <Line type="stepAfter" dataKey="sofr_1m_pct" name="SOFR 1M" stroke={colors.accent} strokeWidth={1.5} strokeDasharray="4 4" dot={false} opacity={0.4} />
                <Line type="stepAfter" dataKey="spread" name="Spread" stroke={colors.amber} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* SOFR Forward | Rate Projection */}
      <div className="grid-2col">
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>SOFR Forward Curve</div>
          <div style={{ height: 220 }}>
            {sofrForward.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sofrForward} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
                  <XAxis dataKey="term" tick={{ fontSize: 10, fill: colors.t3 }} />
                  <YAxis domain={[2, 6]} tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip contentStyle={rechartsDefaults.tooltipStyle} />
                  <Line type="monotone" dataKey="rate" stroke={colors.accent} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>
                SOFR data loads from DB
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Rate Projection (12mo)</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projectionData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `M+${v}`} />
                <YAxis domain={[projYMin, projYMax]} tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={rechartsDefaults.tooltipStyle} formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`]} />
                <Line type="stepAfter" dataKey="bear" name="Bear (SOFR +50bps)" stroke={colors.red} strokeWidth={2} dot={false} />
                <Line type="stepAfter" dataKey="base" name="Base (-100bps)" stroke={colors.amber} strokeWidth={2} dot={false} strokeDasharray="6 3" />
                <Line type="stepAfter" dataKey="bull" name="Bull (-250bps)" stroke={colors.green} strokeWidth={2} dot={false} strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: "var(--text-xs)" }}>
            <span style={{ color: colors.red }}>Bear (SOFR +50bps)</span>
            <span style={{ color: colors.amber }}>Base (-100bps)</span>
            <span style={{ color: colors.green }}>Bull (-250bps)</span>
          </div>
        </div>
      </div>
    </section>
  );
}
