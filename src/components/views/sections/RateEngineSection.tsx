"use client";

import Badge from "@/src/components/ui/Badge";
import { StatRow } from "@/src/components/ui";
import { fmtPct, fmtBps } from "@/src/lib/utils/format";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
  LineChart, Legend,
} from "recharts";
import { colors, rechartsDefaults, STRC_IPO_DATE } from "@/src/lib/chart-config";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  snap: any;
  history: any;
}

export default function RateEngineSection({ snap, history }: Props) {
  const s = snap;
  const rawRates = history?.rates ?? [];
  const sofrForward = history?.sofr_forward ?? [];
  const dividends = history?.dividends ?? [];

  // Build rate lookup from dividend schedule (authoritative, DB-backed)
  const divRateByMonth = new Map<string, number>();
  for (const d of (dividends as Array<{ periodSort: string; ratePct: number }>)) {
    divRateByMonth.set(d.periodSort, d.ratePct);
  }
  function prevMonth(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  }

  // Enrich rates with dividend-schedule rate and spread (filter out pre-IPO data)
  const rates = (rawRates as Array<{ date: string; strc_rate_pct: number; sofr_1m_pct: number }>).filter((r) => r.date >= STRC_IPO_DATE).map((r) => {
    const month = r.date.slice(0, 7);
    const day = parseInt(r.date.slice(8, 10));
    const effectiveMonth = day < 15 ? prevMonth(month) : month;
    const divRate = divRateByMonth.get(effectiveMonth) ?? divRateByMonth.get(prevMonth(effectiveMonth)) ?? r.strc_rate_pct;
    return {
      ...r,
      strc_rate_pct: divRate,
      spread: parseFloat((divRate - r.sofr_1m_pct).toFixed(2)),
    };
  });

  // Rate floor projection (12 months, 3 scenarios)
  const spread = s.strc_rate_pct - s.sofr_1m_pct;
  const projectionData = Array.from({ length: 13 }, (_, m) => {
    const bearSofr = s.sofr_1m_pct + m * (0.5 / 12);
    const baseSofr = Math.max(0, s.sofr_1m_pct - m * (1.0 / 12));
    const bullSofr = Math.max(0, s.sofr_1m_pct - m * (2.5 / 12));
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
    <section id="strc-rate" className="section-anchor">
      <div className="section-header">
        Rate Engine
        <span style={{ marginLeft: 12, display: "inline-flex", gap: 8 }}>
          <span className="badge badge-violet">{fmtPct(s.strc_rate_pct)} Current</span>
          <span className="badge badge-blue">SOFR {fmtPct(s.sofr_1m_pct)}</span>
          <span className="badge badge-neutral">{fmtBps(s.strc_rate_since_ipo_bps)} since IPO</span>
        </span>
      </div>

      {/* Rate History chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Rate History</div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rates} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: string) => v.slice(2, 7)} interval="preserveStartEnd" />
              <YAxis domain={[0, 14]} tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={rechartsDefaults.tooltipStyle} />
              <Line type="stepAfter" dataKey="strc_rate_pct" name="STRC Rate" stroke={colors.violet} strokeWidth={2} dot={false} />
              <Line type="stepAfter" dataKey="sofr_1m_pct" name="SOFR 1M" stroke={colors.accent} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dividend Schedule Table */}
      <div className="card" style={{ overflowX: "auto", marginBottom: 20 }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Dividend Schedule</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              {["Dividend Period", "Record Date", "Payout Date", "Dividend Rate", "Dividend/Share"].map((h) => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--t3)", fontWeight: 500, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dividends.length > 0 ? dividends.map((d: { period: string; periodSort: string; recordDate: string; payoutDate: string; ratePct: number; dividendPerShare: number; isCurrent: boolean; isProRated?: boolean }) => (
              <tr key={d.periodSort} style={{ borderBottom: "1px solid var(--border)", color: d.isCurrent ? "var(--accent)" : "var(--t1)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>
                  {d.period}{d.isProRated ? <sup style={{ fontSize: "var(--text-xs)" }}>*</sup> : null}
                </td>
                <td className="mono" style={{ padding: "8px 12px" }}>{d.recordDate}</td>
                <td className="mono" style={{ padding: "8px 12px" }}>{d.payoutDate}</td>
                <td className="mono" style={{ padding: "8px 12px", fontWeight: 600 }}>{d.ratePct.toFixed(2)}%</td>
                <td className="mono" style={{ padding: "8px 12px", fontWeight: 600 }}>${d.dividendPerShare.toFixed(2)}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} style={{ padding: "12px", color: "var(--t3)" }}>No dividend data available</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: "var(--text-xs)", color: "var(--t3)", fontStyle: "italic", lineHeight: 1.5 }}>
          All expected payout and record dates are subject to declaration of dividend by the board of directors.
          Dividends with non-business-day Payout Dates are paid on the next business day.<br />
          * Accrued from July 29, 2025 through August 31, 2025.
        </div>
      </div>

      {/* Spread over SOFR */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>
          Spread over SOFR
          <span className="mono" style={{ marginLeft: 8, fontSize: "var(--text-sm)", color: "var(--amber)", fontWeight: 600 }}>
            {spread.toFixed(2)}% current
          </span>
        </div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rates} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: string) => v.slice(2, 7)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                contentStyle={rechartsDefaults.tooltipStyle}
                formatter={(v: unknown, name: unknown) => {
                  const val = Number(v);
                  switch (String(name)) {
                    case "spread": return [`${val.toFixed(2)}%`, "Spread"];
                    case "strc_rate_pct": return [`${val.toFixed(2)}%`, "STRC Rate"];
                    case "sofr_1m_pct": return [`${val.toFixed(2)}%`, "SOFR 1M"];
                    default: return [`${val}%`, String(name)];
                  }
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ fontSize: 11, fontFamily: rechartsDefaults.fontFamily, paddingBottom: 8 }}
                formatter={(value: string) => {
                  switch (value) {
                    case "spread": return "Spread (STRC − SOFR)";
                    case "strc_rate_pct": return "STRC Rate";
                    case "sofr_1m_pct": return "SOFR 1M";
                    default: return value;
                  }
                }}
              />
              <Line type="stepAfter" dataKey="strc_rate_pct" stroke={colors.violet} strokeWidth={1.5} dot={false} opacity={0.4} />
              <Line type="stepAfter" dataKey="sofr_1m_pct" stroke={colors.accent} strokeWidth={1.5} strokeDasharray="4 4" dot={false} opacity={0.4} />
              <Line type="stepAfter" dataKey="spread" stroke={colors.amber} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SOFR Forward Curve | Rate Floor Projection */}
      <div className="grid-2col">
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>SOFR Forward Curve (SR1)</div>
          <div style={{ height: 220 }}>
            {sofrForward.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sofrForward} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
                  <XAxis dataKey="term" tick={{ fontSize: 10, fill: colors.t3 }} />
                  <YAxis domain={[2, 6]} tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip contentStyle={rechartsDefaults.tooltipStyle} />
                  <ReferenceLine y={s.sofr_1m_pct} stroke={colors.accent} strokeDasharray="4 4" label={{ value: "Current SOFR", fill: colors.t3, fontSize: 10 }} />
                  <Line type="monotone" dataKey="rate" stroke={colors.accent} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>
                SR1 data loads from FMP futures
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Rate Floor Projection (12mo)</div>
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
