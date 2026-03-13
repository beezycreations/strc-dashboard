"use client";

import { useVolatility, useHistory } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";
import { StatRow } from "@/src/components/ui";
import { fmtPct, fmtMultiple } from "@/src/lib/utils/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

export default function VolatilityView() {
  const { data: vol, isLoading } = useVolatility();
  const { data: history } = useHistory("3m");

  if (isLoading || !vol) {
    return <div className="skeleton" style={{ height: 400 }} />;
  }

  const instruments = vol.instruments ?? [];
  const corrHistory = vol.corr_history ?? history?.corr ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Volatility & Beta Matrix</div>

      {/* Vol + Beta Matrix Table */}
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              {["Ticker", "σ30d", "σ90d", "Vol Ratio", "IV(30d)", "β/BTC", "β/MSTR", "Signal"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "var(--t3)", fontWeight: 500, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {instruments.map((inst: { ticker: string; vol_30d: number; vol_90d: number; vol_ratio: number; iv: number | null; beta_btc_30d: number | null; beta_mstr_30d: number | null; signal: string }) => {
              const isSpy = inst.ticker === "SPY";
              return (
                <tr key={inst.ticker} style={{ borderBottom: "1px solid var(--border)", opacity: isSpy ? 0.6 : 1 }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{inst.ticker}</td>
                  <td className="mono" style={{ padding: "8px 10px" }}>{fmtPct(inst.vol_30d)}</td>
                  <td className="mono" style={{ padding: "8px 10px" }}>{fmtPct(inst.vol_90d)}</td>
                  <td className="mono" style={{ padding: "8px 10px" }}>
                    <span style={{
                      padding: "1px 6px",
                      borderRadius: "var(--r-xs)",
                      background: inst.vol_ratio > 1.5 ? "var(--amber-l)" : "transparent",
                      color: inst.vol_ratio > 1.5 ? "var(--amber)" : "var(--t1)",
                      fontWeight: 600,
                    }}>
                      {inst.vol_ratio.toFixed(2)}
                    </span>
                  </td>
                  <td className="mono" style={{ padding: "8px 10px", color: "var(--violet)" }}>
                    {inst.iv != null ? fmtPct(inst.iv) : "—"}
                  </td>
                  <td className="mono" style={{ padding: "8px 10px" }}>{inst.beta_btc_30d != null ? inst.beta_btc_30d.toFixed(2) : "—"}</td>
                  <td className="mono" style={{ padding: "8px 10px" }}>{inst.beta_mstr_30d != null ? inst.beta_mstr_30d.toFixed(2) : "—"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <Badge variant={inst.signal === "stress" ? "red" : inst.signal === "watch" ? "amber" : "green"}>
                      {inst.signal}
                    </Badge>
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
                Correlation data loading...
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
