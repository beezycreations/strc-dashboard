"use client";

import { useState, useMemo } from "react";
import { useVolumeAtm, useSnapshot } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

interface VolumeDay {
  date: string;
  strc_volume: number;
  strc_price: number;
  mstr_volume: number;
}

interface FlywheelDay {
  date: string;
  strc_issuance_confirmed: number;
  strc_issuance_estimated: number;
  mstr_issuance_estimated: number;
  strc_shares_issued: number;
  mstr_shares_issued: number;
  btc_purchased: number;
  cumulative_btc: number;
  mnav: number;
  source: "confirmed" | "estimated";
}

interface AtmEvent {
  date: string;
  period_start?: string;
  period_end?: string;
  type?: string;
  proceeds_usd: number;
  shares_issued: number;
  avg_price: number;
  btc_purchased?: number;
  avg_btc_price?: number;
  is_estimated: boolean;
  cumulative_proceeds?: number;
}

export default function VolumeATMTracker() {
  const { data, isLoading } = useVolumeAtm();
  const { data: snap } = useSnapshot();
  const [range, setRange] = useState<"1m" | "3m" | "all">("3m");
  const [showMethodology, setShowMethodology] = useState(false);

  const kpi = data?.kpi ?? {};
  const flywheelDays: FlywheelDay[] = data?.flywheel_days ?? [];

  // Filter volume history by range
  const filteredVolume: VolumeDay[] = useMemo(() => {
    if (!data?.volume_history) return [];
    const now = new Date();
    const cutoff =
      range === "1m"
        ? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        : range === "3m"
          ? new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
          : new Date("2025-07-29");
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return (data.volume_history as VolumeDay[]).filter((v) => v.date >= cutoffStr);
  }, [data?.volume_history, range]);

  // Merge volume data with flywheel data for the chart
  const chartData = useMemo(() => {
    if (filteredVolume.length === 0) return [];

    // Build flywheel lookup
    const flywheelMap = new Map(flywheelDays.map((d) => [d.date, d]));

    return filteredVolume.map((v) => {
      const fw = flywheelMap.get(v.date);
      return {
        date: v.date,
        strc_volume: v.strc_volume,
        strc_issuance_confirmed: fw?.strc_issuance_confirmed ?? 0,
        strc_issuance_estimated: fw?.strc_issuance_estimated ?? 0,
        mstr_issuance_estimated: fw?.mstr_issuance_estimated ?? 0,
        btc_purchased: fw?.btc_purchased ?? 0,
        source: fw?.source ?? null,
      };
    });
  }, [filteredVolume, flywheelDays]);

  // Tick interval for X-axis
  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  if (isLoading || !data) {
    return <div className="card"><div className="skeleton" style={{ height: 420 }} /></div>;
  }

  const participationPct = ((kpi.participation_rate_current ?? 0) * 100).toFixed(1);
  const participationSource = kpi.participation_rate_source ?? "unknown";
  const totalBtcEst = chartData.reduce((s, d) => s + d.btc_purchased, 0);

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Volume and ATM Tracker</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["1m", "3m", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--r-xs)",
                border: "1px solid var(--border)",
                background: range === r ? "var(--t1)" : "var(--bg)",
                color: range === r ? "#fff" : "var(--t2)",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {r === "all" ? "All" : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KpiMini label="Today Volume" value={fmtK(kpi.strc_volume_today ?? 0)} />
        <KpiMini label="20d Avg" value={fmtK(kpi.strc_volume_avg_20d ?? 0)} />
        <KpiMini
          label="Participation Rate"
          value={`${participationPct}%`}
          badge={participationSource === "calibrated" ? undefined : "amber"}
        />
        <KpiMini label="ATM Deployed" value={`$${((kpi.strc_atm_deployed_usd ?? 0) / 1e9).toFixed(2)}B`} />
        <KpiMini
          label="Remaining"
          value={`$${((kpi.strc_atm_remaining_usd ?? 0) / 1e9).toFixed(2)}B`}
          badge={(kpi.strc_atm_remaining_usd ?? 0) < 200_000_000 ? "red" : (kpi.strc_atm_remaining_usd ?? 0) < 500_000_000 ? "amber" : undefined}
        />
        <KpiMini label="Est. BTC Bought" value={`${totalBtcEst.toFixed(1)} BTC`} />
      </div>

      {/* Recharts ComposedChart — Stacked Bars + Volume Line */}
      <div style={{ height: 300, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: string) => {
                const d = new Date(v + "T00:00:00");
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
              interval={tickInterval}
            />
            {/* Left Y-axis: Volume (shares) */}
            <YAxis
              yAxisId="vol"
              tick={{ fontSize: 9, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => fmtK(v)}
              width={40}
            />
            {/* Right Y-axis: ATM Issuance ($M) */}
            <YAxis
              yAxisId="atm"
              orientation="right"
              tick={{ fontSize: 9, fill: colors.btc, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}M`}
              width={45}
            />
            <Tooltip
              contentStyle={rechartsDefaults.tooltipStyle}
              labelFormatter={(label: unknown) => {
                const d = new Date(String(label) + "T00:00:00");
                return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
              }}
              formatter={(value: unknown, name: unknown) => {
                const v = Number(value);
                if (v === 0) return null;
                switch (String(name)) {
                  case "strc_volume": return [fmtK(v) + " shares", "STRC Volume"];
                  case "strc_issuance_confirmed": return [`$${v.toFixed(1)}M`, "STRC Issuance (8-K)"];
                  case "strc_issuance_estimated": return [`$${v.toFixed(1)}M`, "STRC Issuance (Est.)"];
                  default: return [`${v}`, String(name)];
                }
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ fontSize: 11, fontFamily: rechartsDefaults.fontFamily, paddingBottom: 8 }}
              formatter={(value: string) => {
                switch (value) {
                  case "strc_volume": return "STRC Volume";
                  case "strc_issuance_confirmed": return "STRC (8-K)";
                  case "strc_issuance_estimated": return "STRC (Est.)";
                  default: return value;
                }
              }}
            />
            {/* STRC volume line */}
            <Line
              yAxisId="vol"
              type="monotone"
              dataKey="strc_volume"
              stroke={colors.accent}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: colors.accent, fill: "#fff" }}
            />
            {/* Stacked issuance bars — STRC confirmed (green) */}
            <Bar
              yAxisId="atm"
              stackId="issuance"
              dataKey="strc_issuance_confirmed"
              fill={colors.green}
              opacity={0.85}
              barSize={6}
              radius={[0, 0, 0, 0]}
            />
            {/* Stacked issuance bars — STRC estimated (amber) */}
            <Bar
              yAxisId="atm"
              stackId="issuance"
              dataKey="strc_issuance_estimated"
              fill={colors.amber}
              opacity={0.7}
              barSize={6}
              radius={[0, 0, 0, 0]}
            />
            {/* MSTR issuance stored in DB but not charted here — displayed in Strategy BTC Purchases */}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footnote */}
      <div style={{ fontSize: 10, color: "var(--t3)", lineHeight: 1.5, marginBottom: 16 }}>
        * Confirmed daily issuance (green) is allocated from 8-K period totals using a volume-weighted average —
        each trading day receives a share proportional to its STRC volume relative to the period total.
        Estimated daily issuance (amber) uses the flywheel participation rate applied to actual daily STRC trading volume.
      </div>

      {/* Event Log + Flywheel Summary */}
      <div className="grid-2col">
        {/* ATM Event Log */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)" }}>ATM Events</span>
            <Badge variant="neutral">{(data.atm_events ?? []).length}</Badge>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "4px 4px", color: "var(--t3)", fontWeight: 500 }}>Period</th>
                  <th style={{ textAlign: "right", padding: "4px 4px", color: "var(--t3)", fontWeight: 500 }}>Proceeds</th>
                  <th style={{ textAlign: "right", padding: "4px 4px", color: "var(--t3)", fontWeight: 500 }}>Shares</th>
                  <th style={{ textAlign: "right", padding: "4px 4px", color: "var(--t3)", fontWeight: 500 }}>BTC</th>
                  <th style={{ textAlign: "right", padding: "4px 4px", color: "var(--t3)", fontWeight: 500 }}>Cum.</th>
                  <th style={{ textAlign: "center", padding: "4px 4px", color: "var(--t3)", fontWeight: 500 }}></th>
                </tr>
              </thead>
              <tbody>
                {((data.atm_events ?? []) as AtmEvent[]).map((evt: AtmEvent, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: evt.is_estimated ? "var(--bg-raised, #FAFAF8)" : undefined }}>
                    <td style={{ padding: "4px 4px", whiteSpace: "nowrap" }}>
                      <span style={{ color: "var(--t2)" }}>
                        {evt.period_start && evt.period_end
                          ? `${evt.period_start.slice(5)} – ${evt.period_end.slice(5)}`
                          : evt.date.slice(5)}
                      </span>
                    </td>
                    <td className="mono" style={{ textAlign: "right", padding: "4px 4px", fontWeight: 600, color: "var(--t1)", whiteSpace: "nowrap" }}>
                      ${evt.proceeds_usd >= 1e9 ? `${(evt.proceeds_usd / 1e9).toFixed(2)}B` : `${(evt.proceeds_usd / 1e6).toFixed(0)}M`}
                    </td>
                    <td className="mono" style={{ textAlign: "right", padding: "4px 4px", color: "var(--t2)", whiteSpace: "nowrap" }}>
                      {(evt.shares_issued / 1e6).toFixed(1)}M
                    </td>
                    <td className="mono" style={{ textAlign: "right", padding: "4px 4px", color: colors.btc, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {evt.btc_purchased != null && evt.btc_purchased > 0
                        ? `${evt.btc_purchased.toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="mono" style={{ textAlign: "right", padding: "4px 4px", color: "var(--t3)", whiteSpace: "nowrap" }}>
                      {evt.cumulative_proceeds != null
                        ? `$${(evt.cumulative_proceeds / 1e9).toFixed(2)}B`
                        : "—"}
                    </td>
                    <td style={{ textAlign: "center", padding: "4px 4px" }}>
                      {evt.is_estimated ? (
                        <Badge variant="amber">Est.</Badge>
                      ) : evt.type === "IPO" ? (
                        <Badge variant="blue">IPO</Badge>
                      ) : (
                        <Badge variant="green">8-K</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data.atm_events ?? []).length === 0 && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", padding: "8px 0" }}>No ATM events recorded</div>
            )}
          </div>
        </div>

        {/* Flywheel Engine Summary */}
        <div>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)", marginBottom: 8 }}>Flywheel Engine</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MiniStat
              label="Participation Rate"
              value={`${participationPct}%`}
            />
            <MiniStat
              label="Rate Source"
              value={participationSource === "calibrated" ? "Volume Backtest" : "Mgmt Guidance"}
            />
            <MiniStat
              label="Flywheel mNAV"
              value={kpi.flywheel_estimated_mnav ? `${Number(kpi.flywheel_estimated_mnav).toFixed(2)}x` : "N/A"}
            />
            <MiniStat
              label="Est. BTC Holdings"
              value={kpi.flywheel_estimated_btc ? `${Math.round(Number(kpi.flywheel_estimated_btc)).toLocaleString()}` : "N/A"}
            />
            <MiniStat
              label="Confirmed vs Estimated"
              value={`${chartData.filter(d => d.source === "confirmed").length} / ${chartData.filter(d => d.source === "estimated").length}`}
            />
            <MiniStat
              label="Est. Pref Notional"
              value={kpi.flywheel_estimated_pref_notional ? `$${(Number(kpi.flywheel_estimated_pref_notional) / 1e9).toFixed(2)}B` : "N/A"}
            />
          </div>
        </div>
      </div>

      {/* Methodology section */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <button
          onClick={() => setShowMethodology(!showMethodology)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 0,
            fontSize: "var(--text-xs)",
            color: "var(--t3)",
            fontWeight: 500,
          }}
        >
          <span style={{ transform: showMethodology ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease", display: "inline-block" }}>
            ▶
          </span>
          Volume × Participation Rate Methodology
        </button>
        {showMethodology && (
          <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--t3)", lineHeight: 1.6 }}>
            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>The BTC Flywheel</strong>: Strategy uses ATM equity
              offerings to raise capital, deployed to purchase Bitcoin. This creates a self-reinforcing cycle: STRC ATM
              issuance → BTC purchases → increased BTC reserves → higher mNAV → MSTR common issuance → more BTC + dividend coverage.
              New STRC shares also increase dividend liability, driving further MSTR common issuance.
            </p>

            <div style={{ background: "var(--bg-raised)", padding: "10px 14px", borderRadius: "var(--r-sm)", marginBottom: 10, border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, color: "var(--t2)", marginBottom: 6 }}>Volume × Participation Rate Model</div>
              <div className="mono" style={{ fontSize: "var(--text-xs)", lineHeight: 1.8 }}>
                <div>est_daily_strc_shares = daily_strc_volume × participation_rate</div>
                <div>participation_rate = {participationPct}% ({participationSource === "calibrated" ? "backtested from 8-K vs volume" : "management guidance"})</div>
                <div>strc_proceeds = est_shares × strc_price → 100% to BTC</div>
                <div>mstr_target = cumulative_div_liability × 1.25 × mNAV_governor</div>
                <div>mNAV_governor: issue if mNAV &gt; 1.0×, halt if below NAV</div>
                <div>mstr_proceeds → dividends first, 25% surplus → BTC</div>
              </div>
            </div>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Confirmed events</strong> (<Badge variant="green">8-K</Badge>): From SEC EDGAR 8-K filings.
              Confirmed totals are allocated proportionally to daily STRC trading volume (volume-weighted), not evenly spread.
              Higher-volume days get a larger share of the confirmed issuance.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Estimated events</strong> (<Badge variant="amber">Est.</Badge>): For days after the last confirmed
              8-K, the engine applies the backtested participation rate to actual daily STRC volume. The rate is recency-weighted
              across confirmed 8-K periods (decay factor 0.65), adapting as Strategy&apos;s issuance intensity changes.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>MSTR common issuance</strong>:
              Demand-driven by the cumulative dividend liability created by STRC issuance. MSTR targets 1.25× the
              incremental annual dividend obligation (11.25% × new STRC notional) — 1.0× for dividend coverage,
              0.25× surplus for additional BTC purchases. All MSTR issuance is subject to the mNAV governor:
              MSTR issues anytime mNAV &gt; 1.0× (above NAV), halted below 1.0×.
              Dividend coverage is cumulative — MSTR catches up when mNAV recovers.
            </p>

            <p style={{ margin: 0, marginTop: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Circular dependency</strong>: New STRC shares → higher preferred notional → higher EV → higher mNAV.
              More BTC → higher BTC reserve → lower mNAV. Resolved day-by-day sequentially — each day&apos;s mNAV depends on
              the previous day&apos;s state plus today&apos;s market data. When a new 8-K arrives, estimates are replaced with
              volume-weighted actuals.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiMini({ label, value, badge }: { label: string; value: string; badge?: "amber" | "red" }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span className="mono" style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>{value}</span>
        {badge && <Badge variant={badge}>{badge === "red" ? "!" : "~"}</Badge>}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t1)" }}>{value}</div>
    </div>
  );
}

function fmtK(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}
