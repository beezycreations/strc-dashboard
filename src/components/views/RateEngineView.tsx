"use client";

import { useSnapshot, useHistory } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";
import { StatRow } from "@/src/components/ui";
import { fmtPct, fmtBps } from "@/src/lib/utils/format";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
  LineChart, Legend,
} from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

export default function RateEngineView() {
  const { data: snap, isLoading } = useSnapshot();
  const { data: history } = useHistory("all");

  if (isLoading || !snap) {
    return <div className="skeleton" style={{ height: 400 }} />;
  }

  const s = snap;
  const rates = history?.rates ?? [];
  const sofrForward = history?.sofr_forward ?? [];

  // Rate floor projection (12 months, 3 scenarios)
  const projectionData = Array.from({ length: 13 }, (_, m) => ({
    month: m,
    bear: Math.max(s.sofr_1m_pct, s.strc_rate_pct - m * 0.25),
    base: Math.max(s.sofr_1m_pct - 0.5, s.strc_rate_pct - m * 0.25),
    bull: Math.max(s.sofr_1m_pct - 1.0, s.strc_rate_pct - m * 0.25),
    current: m === 0 ? s.strc_rate_pct : undefined,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Rate Engine</span>
        <span className="badge badge-violet">{fmtPct(s.strc_rate_pct)} Current</span>
        <span className="badge badge-blue">SOFR {fmtPct(s.sofr_1m_pct)}</span>
        <span className="badge badge-neutral">{fmtBps(s.strc_rate_since_ipo_bps)} since IPO</span>
      </div>

      {/* Rate History chart | Announcement Log */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--card-gap)" }}>
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Rate History</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rates} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: string) => v.slice(2, 7)} interval="preserveStartEnd" />
                <YAxis domain={[0, 14]} tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={rechartsDefaults.tooltipStyle} />
                <Bar dataKey="strc_rate_pct" name="STRC Rate" fill={colors.violet} opacity={0.7} barSize={8} />
                <Line type="stepAfter" dataKey="sofr_1m_pct" name="SOFR 1M" stroke={colors.accent} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Announcements</div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {rates.length > 0 ? (
              [...rates].reverse().filter((_: unknown, i: number) => {
                if (i === 0) return true;
                const reversed = [...rates].reverse() as Array<{ strc_rate_pct: number }>;
                return reversed[i]?.strc_rate_pct !== reversed[i - 1]?.strc_rate_pct;
              }).slice(0, 20).map((r: { date: string; strc_rate_pct: number }, i: number) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: "var(--text-sm)" }}>
                  <span style={{ color: "var(--t3)", minWidth: 70 }}>{r.date}</span>
                  <span className="mono" style={{ fontWeight: 600, color: "var(--violet)" }}>{fmtPct(r.strc_rate_pct)}</span>
                </div>
              ))
            ) : (
              <div style={{ color: "var(--t3)", fontSize: "var(--text-sm)" }}>No rate history available</div>
            )}
          </div>
        </div>
      </div>

      {/* SOFR Forward Curve | Rate Floor Projection */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--card-gap)" }}>
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
                <YAxis domain={[2, 14]} tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={rechartsDefaults.tooltipStyle} />
                <Line type="stepAfter" dataKey="bear" name="Bear (SOFR flat)" stroke={colors.red} strokeWidth={1.5} dot={false} />
                <Line type="stepAfter" dataKey="base" name="Base (SOFR -50bps)" stroke={colors.amber} strokeWidth={1.5} dot={false} />
                <Line type="stepAfter" dataKey="bull" name="Bull (SOFR -100bps)" stroke={colors.green} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: "var(--text-xs)" }}>
            <span style={{ color: colors.red }}>Bear (SOFR flat)</span>
            <span style={{ color: colors.amber }}>Base (-50bps)</span>
            <span style={{ color: colors.green }}>Bull (-100bps)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
