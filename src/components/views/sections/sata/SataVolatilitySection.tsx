"use client";

import Badge from "@/src/components/ui/Badge";
import { MetricCard, HedgeRefCard } from "@/src/components/ui";
import { fmtPct } from "@/src/lib/utils/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  vol: any;
}

export default function SataVolatilitySection({ vol }: Props) {
  const instruments = vol?.instruments ?? [];
  const corrHistory = vol?.corr_history ?? [];
  const sataMetrics = vol?.sata_metrics ?? { sharpe_ratio: null, corr_btc: null, vol_1y: null, vol_1y_days: null, vol_1y_is_calendar: false };
  const sataInst = instruments.find((i: { ticker: string }) => i.ticker === "SATA");
  const lastUpdated = vol?.last_updated;

  return (
    <section id="sata-volatility" className="section-anchor">
      <div className="section-header">Volatility &amp; Beta Matrix</div>

      {vol?.data_available === false && (
        <div style={{ padding: "10px 14px", borderRadius: "var(--r-xs)", background: "var(--amber-l)", color: "var(--amber)", fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: 20 }}>
          No price data available — add <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>FMP_API_KEY</code> to <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>.env.local</code> to enable live market data
        </div>
      )}

      {/* SATA Key Metrics */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <MetricCard label="Sharpe Ratio" value={sataMetrics.sharpe_ratio != null ? sataMetrics.sharpe_ratio.toFixed(2) : null} color="var(--accent)" ts={lastUpdated} />
        <MetricCard label="BTC Correlation" value={sataMetrics.corr_btc != null ? fmtPct(sataMetrics.corr_btc * 100, 0) : null} color="var(--btc)" ts={lastUpdated} />
        <MetricCard label="Hist Volatility 30D" value={sataInst?.vol_30d != null ? fmtPct(sataInst.vol_30d) : null} color="var(--violet)" ts={lastUpdated} />
        <MetricCard label={sataMetrics.vol_1y_is_calendar ? "Hist Volatility (1Y)" : sataMetrics.vol_1y_days != null ? `Hist Volatility (${sataMetrics.vol_1y_days}d)` : "Hist Volatility (1Y)"} value={sataMetrics.vol_1y != null ? fmtPct(sataMetrics.vol_1y) : null} color="var(--amber)" ts={lastUpdated} />
      </div>

      {/* Vol + Beta Matrix Table */}
      <div className="card" style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              {["Ticker", "σ30d", "σ90d", "Vol Ratio", "β/BTC", "β/MSTR", "Signal"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "var(--t3)", fontWeight: 500, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {instruments.map((inst: { ticker: string; vol_30d: number | null; vol_90d: number | null; vol_ratio: number | null; beta_btc_30d: number | null; beta_mstr_30d: number | null; signal: string | null }) => (
              <tr key={inst.ticker} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{inst.ticker}</td>
                <td className="mono" style={{ padding: "8px 10px" }}>{inst.vol_30d != null ? fmtPct(inst.vol_30d) : "—"}</td>
                <td className="mono" style={{ padding: "8px 10px" }}>{inst.vol_90d != null ? fmtPct(inst.vol_90d) : "—"}</td>
                <td className="mono" style={{ padding: "8px 10px" }}>
                  {inst.vol_ratio != null ? (
                    <span style={{
                      padding: "1px 6px",
                      borderRadius: "var(--r-xs)",
                      background: inst.vol_ratio > 1.5 ? "var(--amber-l)" : "transparent",
                      color: inst.vol_ratio > 1.5 ? "var(--amber)" : "var(--t1)",
                      fontWeight: 600,
                    }}>
                      {inst.vol_ratio.toFixed(2)}
                    </span>
                  ) : "—"}
                </td>
                <td className="mono" style={{ padding: "8px 10px" }}>{inst.beta_btc_30d != null ? inst.beta_btc_30d.toFixed(2) : "—"}</td>
                <td className="mono" style={{ padding: "8px 10px" }}>{inst.beta_mstr_30d != null ? inst.beta_mstr_30d.toFixed(2) : "—"}</td>
                <td style={{ padding: "8px 10px" }}>
                  {inst.signal != null ? (
                    <Badge variant={inst.signal === "high" ? "red" : inst.signal === "elevated" ? "amber" : "green"}>
                      {inst.signal}
                    </Badge>
                  ) : <span style={{ color: "var(--t3)" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Correlation chart + Hedge reference panels */}
      <div className="grid-2col">
        <div className="card">
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Rolling Correlation (30d)</div>
          <div style={{ height: 220 }}>
            {corrHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={corrHistory} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis domain={[-0.5, 1]} tick={{ fontSize: 10, fill: colors.t3 }} />
                  <Tooltip contentStyle={rechartsDefaults.tooltipStyle} />
                  <Line type="monotone" dataKey="sata_mstr" name="SATA-MSTR" stroke={colors.accent} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sata_btc" name="SATA-BTC" stroke={colors.btc} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>
                {vol?.data_available === false ? "No price data available — check FMP_API_KEY" : "Correlation data loading..."}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: "var(--text-xs)" }}>
            <span style={{ color: colors.accent }}>SATA-MSTR</span>
            <span style={{ color: colors.btc }}>SATA-BTC</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--card-gap)" }}>
          <HedgeRefCard
            title="MSTR Hedge Reference"
            betaLabel="Beta to MSTR (30d)"
            betaValue={sataInst?.beta_mstr_30d ?? null}
            source="β × MSTR 30d IV"
          />
          <HedgeRefCard
            title="BTC Hedge Reference"
            betaLabel="Beta to BTC (30d)"
            betaValue={sataInst?.beta_btc_30d ?? null}
            source="β × Deribit 30d IV"
          />
        </div>
      </div>
    </section>
  );
}
