"use client";

import { useState, useMemo } from "react";
import { useVolumeAtm, useSnapshot } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";
import {
  getDailyEstimates,
  getWeightedDailyPace,
  getEngineSummary,
  backtestPaceModel,
} from "@/src/lib/calculators/issuance-engine";
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

interface AtmEvent {
  date: string;
  proceeds_usd: number;
  shares_issued: number;
  avg_price: number;
  is_estimated: boolean;
}

export default function VolumeATMTracker() {
  const { data, isLoading } = useVolumeAtm();
  const { data: snap } = useSnapshot();
  const [range, setRange] = useState<"1m" | "3m" | "all">("3m");
  const [showMethodology, setShowMethodology] = useState(false);

  const kpi = data?.kpi ?? {};
  const btcPrice = snap?.btc_price ?? 70000;

  // 8-K-derived engine data (static, from confirmed filings — no mock dependency)
  const engineSummary = useMemo(() => getEngineSummary(), []);
  const pace = useMemo(() => getWeightedDailyPace(), []);
  const paceBacktest = useMemo(() => backtestPaceModel(), []);

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

  // Merge volume data (from API) with issuance estimates (from 8-K engine)
  // Volume lines come from the API; ATM bars come from the issuance engine.
  // This eliminates the dependency on mock-data-poisoned participation rates.
  const chartData = useMemo(() => {
    if (filteredVolume.length === 0) return [];

    const startDate = filteredVolume[0].date;
    const endDate = filteredVolume[filteredVolume.length - 1].date;

    // Get daily issuance estimates from the unified 8-K engine
    const estimates = getDailyEstimates(startDate, endDate, btcPrice);
    const estimateMap = new Map(estimates.map((e) => [e.date, e]));

    return filteredVolume.map((v) => {
      const est = estimateMap.get(v.date);
      const totalProceeds = est?.total_proceeds ?? 0;
      const isConfirmed = est?.source === "confirmed";

      return {
        date: v.date,
        strc_volume: v.strc_volume,
        mstr_volume: v.mstr_volume,
        strc_price: v.strc_price,
        atm_proceeds_confirmed: isConfirmed ? totalProceeds / 1e6 : 0,
        atm_proceeds_estimated: !isConfirmed && totalProceeds > 0 ? totalProceeds / 1e6 : 0,
        atm_btc: est?.btc_estimate ?? 0,
        atm_source: est?.source ?? null,
      };
    });
  }, [filteredVolume, btcPrice]);

  // Tick interval for X-axis
  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  if (isLoading || !data) {
    return <div className="card"><div className="skeleton" style={{ height: 420 }} /></div>;
  }

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
          label="Vol / Avg"
          value={`${(kpi.strc_volume_ratio ?? 1).toFixed(2)}×`}
          badge={(kpi.strc_volume_ratio ?? 1) >= 3 ? "red" : (kpi.strc_volume_ratio ?? 1) >= 2 ? "amber" : undefined}
        />
        <KpiMini label="ATM Deployed" value={`$${((kpi.strc_atm_deployed_usd ?? 0) / 1e9).toFixed(2)}B`} />
        <KpiMini
          label="Remaining"
          value={`$${((kpi.strc_atm_remaining_usd ?? 0) / 1e9).toFixed(2)}B`}
          badge={(kpi.strc_atm_remaining_usd ?? 0) < 200_000_000 ? "red" : (kpi.strc_atm_remaining_usd ?? 0) < 500_000_000 ? "amber" : undefined}
        />
        <KpiMini label="Est. BTC Bought" value={`${chartData.reduce((s, d) => s + d.atm_btc, 0).toFixed(1)} BTC`} />
      </div>

      {/* Recharts ComposedChart */}
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
            {/* Right Y-axis: ATM Proceeds ($M) */}
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
                  case "atm_proceeds_confirmed": return [`$${v.toFixed(1)}M`, "ATM Issuance (8-K)"];
                  case "atm_proceeds_estimated": return [`$${v.toFixed(1)}M`, "ATM Issuance (Est.)"];
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
                  case "atm_proceeds_confirmed": return "ATM (8-K Confirmed)";
                  case "atm_proceeds_estimated": return "ATM (Estimated)";
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
            {/* ATM issuance bars — confirmed (green) */}
            <Bar
              yAxisId="atm"
              dataKey="atm_proceeds_confirmed"
              fill={colors.green}
              opacity={0.85}
              barSize={6}
              radius={[2, 2, 0, 0]}
            />
            {/* ATM issuance bars — estimated (amber) */}
            <Bar
              yAxisId="atm"
              dataKey="atm_proceeds_estimated"
              fill={colors.amber}
              opacity={0.7}
              barSize={6}
              radius={[2, 2, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Event Log + Issuance Engine Summary */}
      <div className="grid-2col">
        {/* ATM Event Log */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)" }}>ATM Events</span>
            <Badge variant="neutral">{(data.atm_events ?? []).length}</Badge>
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto", overflowX: "auto" }}>
            {([...(data.atm_events ?? [])] as AtmEvent[]).sort((a, b) => b.date.localeCompare(a.date)).map((evt: AtmEvent, i: number) => (
              <div key={i} style={{ display: "flex", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: "var(--text-xs)", alignItems: "center", minWidth: "fit-content" }}>
                <span style={{ color: "var(--t3)", whiteSpace: "nowrap" }}>{evt.date}</span>
                <span className="mono" style={{ color: "var(--btc-d)", fontWeight: 600, whiteSpace: "nowrap" }}>${(evt.proceeds_usd / 1e6).toFixed(0)}M</span>
                <span className="mono" style={{ color: "var(--t2)", whiteSpace: "nowrap" }}>{(evt.shares_issued / 1e6).toFixed(1)}M sh</span>
                <span className="mono" style={{ color: "var(--t3)", whiteSpace: "nowrap" }}>@${evt.avg_price.toFixed(2)}</span>
                {evt.is_estimated ? (
                  <Badge variant="amber">Est.</Badge>
                ) : (
                  <Badge variant="green">8-K</Badge>
                )}
              </div>
            ))}
            {(data.atm_events ?? []).length === 0 && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", padding: "8px 0" }}>No ATM events recorded</div>
            )}
          </div>
        </div>

        {/* 8-K Issuance Engine Summary */}
        <div>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)", marginBottom: 8 }}>8-K Issuance Engine</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MiniStat
              label="Weighted Daily Pace"
              value={`$${(pace.total_daily / 1e6).toFixed(1)}M/day`}
            />
            <MiniStat
              label="STRC Share of Proceeds"
              value={`${(pace.strc_share * 100).toFixed(0)}%`}
            />
            <MiniStat
              label="Conversion Rate (8-K)"
              value={`${(pace.conversion_rate * 100).toFixed(0)}%`}
            />
            <MiniStat
              label="8-K Periods Used"
              value={`${engineSummary.periods}`}
            />
            <MiniStat
              label="Confirmed vs Estimated"
              value={`${chartData.filter(d => d.atm_source === "confirmed").length} / ${chartData.filter(d => d.atm_source === "estimated").length}`}
            />
            <MiniStat
              label="Backtest MAPE"
              value={`${paceBacktest.mape.toFixed(1)}%`}
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
          ATM Estimation &amp; BTC Flywheel Methodology
        </button>
        {showMethodology && (
          <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--t3)", lineHeight: 1.6 }}>
            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>The BTC Flywheel</strong>: Strategy (formerly MicroStrategy) uses ATM equity
              offerings to raise capital, which is then deployed to purchase Bitcoin. This creates a self-reinforcing cycle: equity
              issuance → BTC purchases → increased BTC reserves → higher mNAV → further issuance capacity. The preferred stock
              tranches (STRC, STRF, STRK, STRD) fund the same treasury alongside MSTR common ATM issuance.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>8-K-Derived Methodology</strong>: All estimation parameters are derived directly from
              confirmed SEC 8-K filings — no assumed participation rates or mock data calibration. The issuance engine analyzes {engineSummary.periods} confirmed
              8-K periods covering {engineSummary.total_trading_days} trading days and ${(engineSummary.total_proceeds / 1e9).toFixed(1)}B in total proceeds.
            </p>

            <div style={{ background: "var(--bg-raised)", padding: "10px 14px", borderRadius: "var(--r-sm)", marginBottom: 10, border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, color: "var(--t2)", marginBottom: 6 }}>8-K Confirmed Parameters</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 12px", fontSize: "var(--text-xs)" }}>
                <span>Weighted Daily Pace: <strong className="mono">${(pace.total_daily / 1e6).toFixed(1)}M</strong></span>
                <span>STRC Daily Pace: <strong className="mono">${(pace.strc_daily / 1e6).toFixed(1)}M</strong></span>
                <span>MSTR Daily Pace: <strong className="mono">${(pace.mstr_daily / 1e6).toFixed(1)}M</strong></span>
                <span>Conversion Rate: <strong className="mono">{(pace.conversion_rate * 100).toFixed(0)}%</strong></span>
                <span>STRC Share: <strong className="mono">{(pace.strc_share * 100).toFixed(0)}%</strong></span>
                <span>Backtest MAPE: <strong className="mono">{paceBacktest.mape.toFixed(1)}%</strong></span>
              </div>
              <div style={{ marginTop: 6, fontSize: "var(--text-xs)", color: "var(--t3)" }}>
                All parameters derived from {engineSummary.periods} confirmed 8-K filings via exponentially-weighted pace model (decay = 0.65).
                Most recent periods carry more weight. Recalibrates automatically when new 8-K data is added.
              </div>
            </div>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Confirmed events</strong> (<Badge variant="green">8-K</Badge>): Sourced directly from SEC EDGAR 8-K filings.
              These report exact proceeds, shares issued, and weighted-average price. Strategy typically files 8-Ks within 2–5 business days of issuance.
              For confirmed periods, the period total is allocated evenly across trading days.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Estimated events</strong> (<Badge variant="amber">Est.</Badge>): For days after the last confirmed
              8-K period, the engine projects forward using the exponentially-weighted daily pace derived from confirmed data. Recent 8-K periods
              carry exponentially more weight (decay factor 0.65), so the forecast adapts as Strategy&apos;s issuance intensity changes.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Estimation formula</strong>:
            </p>
            <div className="mono" style={{ background: "var(--bg-raised)", padding: "10px 14px", borderRadius: "var(--r-sm)", marginBottom: 10, fontSize: "var(--text-xs)", lineHeight: 1.8 }}>
              <div>weighted_daily_pace = Σ(period_daily_proceeds × decay^rank × trading_days) / Σ(weights)</div>
              <div>est_daily_proceeds = ${(pace.total_daily / 1e6).toFixed(1)}M (STRC: ${(pace.strc_daily / 1e6).toFixed(1)}M + MSTR: ${(pace.mstr_daily / 1e6).toFixed(1)}M)</div>
              <div>est_btc_per_day = est_daily_proceeds × {(pace.conversion_rate * 100).toFixed(0)}% / btc_price</div>
            </div>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Management guidance</strong>: Strategy management has guided ~25% participation rate
              for ATM issuance relative to daily trading volume. This rate is used in the flywheel forecast engine when real
              volume data is available from the database. The 8-K pace-based approach shown here is independent of volume data
              and serves as the primary estimation methodology between confirmed filings.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Cross-validation</strong>: Leave-one-out backtest across {paceBacktest.periods} 8-K periods
              shows {paceBacktest.mape.toFixed(1)}% MAPE with {paceBacktest.bias > 0 ? "+" : ""}{paceBacktest.bias.toFixed(1)}% directional bias.
              High variability in issuance pace across periods
              makes precision challenging, but the recency-weighted model tracks Strategy&apos;s evolving pace.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>8-K reconciliation</strong>: When a confirmed 8-K filing is received, it overrides all
              prior daily estimates within its coverage period. Confirmed totals are allocated evenly across trading days in the period.
              This ensures the chart always ties back to actuals once official data is available.
            </p>

            <p style={{ margin: 0, marginTop: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Limitations</strong>: The pace model assumes issuance is relatively stable day-to-day.
              In reality, issuance volume varies dramatically (e.g., $7.1M vs $1,180M in recent periods). All estimates are provisional
              and will be replaced by confirmed figures as 8-K filings are processed (typically 2–5 business days after issuance).
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
