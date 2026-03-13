"use client";

import { useVolatility, useHistory } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";
import { StatRow } from "@/src/components/ui";
import { fmtPct, fmtMultiple } from "@/src/lib/utils/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

function AsOf({ ts }: { ts?: string }) {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  let label: string;
  if (diffMins < 1) label = "just now";
  else if (diffMins < 60) label = `${diffMins}m ago`;
  else if (diffMins < 1440) label = `${Math.floor(diffMins / 60)}h ago`;
  else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return (
    <span style={{ fontSize: "var(--text-xs)", color: "var(--t3)", fontWeight: 400 }} title={`${timeStr}`}>
      as of {label}
    </span>
  );
}

export default function VolatilityView() {
  const { data: vol, isLoading } = useVolatility();
  const { data: history } = useHistory("3m");

  if (isLoading || !vol) {
    return <div className="skeleton" style={{ height: 400 }} />;
  }

  const instruments = vol.instruments ?? [];
  const corrHistory = vol.corr_history ?? history?.corr ?? [];
  const strcMetrics = vol.strc_metrics ?? { sharpe_ratio: null, corr_btc: null, corr_spy: null, vol_1y: null, vol_1y_days: null, vol_1y_is_calendar: false };
  const strcInst = instruments.find((i: { ticker: string }) => i.ticker === "STRC");
  const lastUpdated = vol.last_updated;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Volatility & Beta Matrix</div>
        <AsOf ts={lastUpdated} />
      </div>

      {vol.data_available === false && (
        <div style={{ padding: "10px 14px", borderRadius: "var(--r-xs)", background: "var(--amber-l)", color: "var(--amber)", fontSize: "var(--text-sm)", fontWeight: 500 }}>
          No price data available — add <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>FMP_API_KEY</code> to <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>.env.local</code> to enable live market data
        </div>
      )}

      {/* STRC Key Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--card-gap)" }}>
        <MetricCard label="Sharpe Ratio" value={strcMetrics.sharpe_ratio != null ? strcMetrics.sharpe_ratio.toFixed(2) : null} color="var(--accent)" ts={lastUpdated} />
        <MetricCard label="BTC Correlation" value={strcMetrics.corr_btc != null ? fmtPct(strcMetrics.corr_btc * 100, 0) : null} color="var(--btc)" ts={lastUpdated} />
        <MetricCard label="SPY Correlation" value={strcMetrics.corr_spy != null ? fmtPct(strcMetrics.corr_spy * 100, 0) : null} color="var(--t2)" ts={lastUpdated} />
        <MetricCard label="Hist Volatility 30D" value={strcInst?.vol_30d != null ? fmtPct(strcInst.vol_30d) : null} color="var(--violet)" ts={lastUpdated} />
        <MetricCard label={strcMetrics.vol_1y_is_calendar ? "Hist Volatility (1Y)" : strcMetrics.vol_1y_days != null ? `Hist Volatility (${strcMetrics.vol_1y_days}d)` : "Hist Volatility (1Y)"} value={strcMetrics.vol_1y != null ? fmtPct(strcMetrics.vol_1y) : null} color="var(--amber)" ts={lastUpdated} />
      </div>

      {/* Vol + Beta Matrix Table */}
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              {["Ticker", "σ30d", "σ90d", "Vol Ratio", "β/BTC", "β/MSTR", "Signal"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "var(--t3)", fontWeight: 500, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {instruments.map((inst: { ticker: string; vol_30d: number | null; vol_90d: number | null; vol_ratio: number | null; beta_btc_30d: number | null; beta_mstr_30d: number | null; signal: string | null }) => {
              const isSpy = inst.ticker === "SPY";
              return (
                <tr key={inst.ticker} style={{ borderBottom: "1px solid var(--border)", opacity: isSpy ? 0.6 : 1 }}>
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
                      <Badge variant={inst.signal === "stress" ? "red" : inst.signal === "watch" ? "amber" : "green"}>
                        {inst.signal}
                      </Badge>
                    ) : <span style={{ color: "var(--t3)" }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Correlation chart + Hedge reference panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--card-gap)" }}>
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
                  <Line type="monotone" dataKey="strc_mstr" name="STRC-MSTR" stroke={colors.accent} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="strc_btc" name="STRC-BTC" stroke={colors.btc} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>
                {vol.data_available === false ? "No price data available — check FMP_API_KEY" : "Correlation data loading..."}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: "var(--text-xs)" }}>
            <span style={{ color: colors.accent }}>STRC-MSTR</span>
            <span style={{ color: colors.btc }}>STRC-BTC</span>
          </div>
        </div>

        {/* Hedge Reference Panels (read-only) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--card-gap)" }}>
          <HedgeRefCard
            title="MSTR Hedge Reference"
            betaLabel="Beta to MSTR (30d)"
            betaValue={instruments.find((i: { ticker: string }) => i.ticker === "STRC")?.beta_mstr_30d ?? 0.22}
            source="β × MSTR 30d IV"
          />
          <HedgeRefCard
            title="BTC Hedge Reference"
            betaLabel="Beta to BTC (30d)"
            betaValue={instruments.find((i: { ticker: string }) => i.ticker === "STRC")?.beta_btc_30d ?? 0.18}
            source="β × Deribit 30d IV"
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, ts }: { label: string; value: string | null; color: string; ts?: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>{label}</div>
        {value != null && <AsOf ts={ts} />}
      </div>
      <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: value != null ? color : "var(--t3)" }}>
        {value ?? "N/A"}
      </div>
    </div>
  );
}

function HedgeRefCard({ title, betaLabel, betaValue, source }: { title: string; betaLabel: string; betaValue: number; source: string }) {
  const ratio = (betaValue * 100).toFixed(0);
  const notional = Math.round(betaValue * 1_000_000);
  return (
    <div className="card" style={{ padding: 14, cursor: "pointer" }} title="Click to open Position Modes">
      <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "var(--text-xs)" }}>
        <div>
          <div style={{ color: "var(--t3)" }}>{betaLabel}</div>
          <div className="mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{betaValue.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ color: "var(--t3)" }}>Hedge Ratio</div>
          <div className="mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{ratio}% of position</div>
        </div>
        <div>
          <div style={{ color: "var(--t3)" }}>Notional (@$1M)</div>
          <div className="mono" style={{ fontWeight: 600 }}>${notional.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ color: "var(--t3)" }}>Source</div>
          <div style={{ color: "var(--t2)" }}>{source}</div>
        </div>
      </div>
    </div>
  );
}
