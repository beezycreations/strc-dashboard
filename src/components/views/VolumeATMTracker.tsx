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

interface AtmEvent {
  date: string;
  proceeds_usd: number;
  shares_issued: number;
  avg_price: number;
  is_estimated: boolean;
}

// Default participation rate and BTC price for estimation
const DEFAULT_PARTICIPATION_RATE = 0.032;
const VOLUME_THRESHOLD = 1.5; // volume must exceed 1.5× 20d avg to trigger estimate

export default function VolumeATMTracker() {
  const { data, isLoading } = useVolumeAtm();
  const { data: snap } = useSnapshot();
  const [range, setRange] = useState<"1m" | "3m" | "all">("3m");
  const [showMethodology, setShowMethodology] = useState(false);

  const kpi = data?.kpi ?? {};
  const participationRate = kpi.participation_rate_current ?? DEFAULT_PARTICIPATION_RATE;
  const btcPrice = snap?.btc_price ?? 70000;

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

  // Build ATM event lookup by date
  const atmEventMap = useMemo(() => {
    const map = new Map<string, AtmEvent>();
    for (const evt of (data?.atm_events ?? []) as AtmEvent[]) {
      map.set(evt.date, evt);
    }
    return map;
  }, [data?.atm_events]);

  // Compute 20d moving average for volume-based ATM estimation
  const chartData = useMemo(() => {
    const allVolume = (data?.volume_history ?? []) as VolumeDay[];
    const volByDate = new Map<string, number>();
    allVolume.forEach((v) => volByDate.set(v.date, v.strc_volume));

    return filteredVolume.map((v, idx) => {
      // Calculate 20d avg from full history up to this point
      const fullIdx = allVolume.findIndex((x) => x.date === v.date);
      const lookback = allVolume.slice(Math.max(0, fullIdx - 19), fullIdx + 1);
      const avg20d = lookback.length > 0
        ? lookback.reduce((s, x) => s + x.strc_volume, 0) / lookback.length
        : v.strc_volume;

      // Check if there's a confirmed/estimated ATM event
      const atmEvent = atmEventMap.get(v.date);

      // Daily ATM estimation: if no event logged but volume exceeds threshold, estimate
      let atm_proceeds = 0;
      let atm_btc = 0;
      let atm_source: "confirmed" | "estimated" | "inferred" | null = null;

      if (atmEvent) {
        atm_proceeds = atmEvent.proceeds_usd;
        atm_btc = atm_proceeds / btcPrice;
        atm_source = atmEvent.is_estimated ? "estimated" : "confirmed";
      } else if (v.strc_volume > avg20d * VOLUME_THRESHOLD) {
        // Infer potential ATM activity from excess volume
        const excessShares = (v.strc_volume - avg20d) * participationRate;
        atm_proceeds = excessShares * v.strc_price;
        atm_btc = atm_proceeds / btcPrice;
        atm_source = "inferred";
      }

      return {
        date: v.date,
        strc_volume: v.strc_volume,
        mstr_volume: v.mstr_volume,
        strc_price: v.strc_price,
        avg_20d: Math.round(avg20d),
        atm_proceeds_confirmed: atm_source === "confirmed" ? atm_proceeds / 1e6 : 0,
        atm_proceeds_estimated: atm_source === "estimated" || atm_source === "inferred" ? atm_proceeds / 1e6 : 0,
        atm_btc: atm_btc > 0 ? atm_btc : 0,
        atm_source,
      };
    });
  }, [filteredVolume, atmEventMap, data?.volume_history, participationRate, btcPrice]);

  // Tick interval for X-axis
  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  if (isLoading || !data) {
    return <div className="card"><div className="skeleton" style={{ height: 420 }} /></div>;
  }

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Volume and ATM Issuance Tracker</div>
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
      <div style={{ height: 320, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 60, bottom: 5, left: 5 }}>
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
              tick={{ fontSize: 10, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => fmtK(v)}
              width={55}
            />
            {/* Right Y-axis: ATM Proceeds ($M) */}
            <YAxis
              yAxisId="atm"
              orientation="right"
              tick={{ fontSize: 10, fill: colors.btc, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}M`}
              width={55}
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
                  case "mstr_volume": return [fmtK(v) + " shares", "MSTR Volume"];
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
                  case "mstr_volume": return "MSTR Volume";
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
            {/* MSTR volume line (lighter, dashed) */}
            <Line
              yAxisId="vol"
              type="monotone"
              dataKey="mstr_volume"
              stroke={colors.t3}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3, stroke: colors.t3, fill: "#fff" }}
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

      {/* Event Log + BTC Estimation */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--card-gap)" }}>
        {/* ATM Event Log */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)" }}>ATM Events</span>
            <Badge variant="neutral">{(data.atm_events ?? []).length}</Badge>
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {(data.atm_events ?? []).slice().reverse().map((evt: AtmEvent, i: number) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: "var(--text-xs)", alignItems: "center" }}>
                <span style={{ color: "var(--t3)", minWidth: 68 }}>{evt.date}</span>
                <span className="mono" style={{ color: "var(--btc-d)", fontWeight: 600, minWidth: 42 }}>${(evt.proceeds_usd / 1e6).toFixed(0)}M</span>
                <span className="mono" style={{ color: "var(--t2)", minWidth: 50 }}>{(evt.shares_issued / 1e6).toFixed(1)}M sh</span>
                <span className="mono" style={{ color: "var(--t3)", minWidth: 48 }}>@${evt.avg_price.toFixed(2)}</span>
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

        {/* BTC Purchase Estimation Summary */}
        <div>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)", marginBottom: 8 }}>Estimated BTC Accumulation</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MiniStat
              label="Total ATM Proceeds (period)"
              value={`$${chartData.reduce((s, d) => s + d.atm_proceeds_confirmed + d.atm_proceeds_estimated, 0).toFixed(0)}M`}
            />
            <MiniStat
              label="Est. BTC Purchased"
              value={`${chartData.reduce((s, d) => s + d.atm_btc, 0).toFixed(1)} BTC`}
            />
            <MiniStat
              label="Avg BTC Price Used"
              value={`$${btcPrice.toLocaleString()}`}
            />
            <MiniStat
              label="Active Issuance Days"
              value={`${chartData.filter(d => d.atm_source !== null).length} / ${chartData.length}`}
            />
            <MiniStat
              label="Confirmed vs Estimated"
              value={`${chartData.filter(d => d.atm_source === "confirmed").length} / ${chartData.filter(d => d.atm_source === "estimated" || d.atm_source === "inferred").length}`}
            />
            <MiniStat
              label="Participation Rate"
              value={`${(participationRate * 100).toFixed(1)}%`}
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
              <strong style={{ color: "var(--t2)" }}>Confirmed events</strong> (<Badge variant="green">8-K</Badge>): Sourced directly from SEC EDGAR 8-K filings
              or official press releases. These report exact proceeds, shares issued, and weighted-average price.
              Strategy typically files 8-Ks within 2–5 business days of issuance.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Estimated events</strong> (<Badge variant="amber">Est.</Badge>): On days when daily volume
              exceeds the 20-day moving average by {VOLUME_THRESHOLD}× or more, we estimate ATM activity using a calibrated participation rate.
              This rate represents the historical proportion of daily trading volume attributable to ATM issuance, derived from
              back-testing against confirmed 8-K filings.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Estimation formula</strong>:
            </p>
            <div className="mono" style={{ background: "var(--bg-raised)", padding: "10px 14px", borderRadius: "var(--r-sm)", marginBottom: 10, fontSize: "var(--text-xs)", lineHeight: 1.8 }}>
              <div>excess_shares = (daily_volume − 20d_avg) × participation_rate</div>
              <div>est_proceeds = excess_shares × VWAP</div>
              <div>est_btc_purchased = est_proceeds ÷ btc_price</div>
            </div>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Participation rate</strong>: Currently calibrated
              at {(participationRate * 100).toFixed(1)}% (historical
              range: {((kpi.participation_rate_range?.[0] ?? 0.018) * 100).toFixed(1)}%–{((kpi.participation_rate_range?.[1] ?? 0.045) * 100).toFixed(1)}%).
              The rate is recalibrated periodically as new 8-K filings provide ground-truth data points.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>BTC purchase estimation</strong>: ATM proceeds (confirmed or estimated) are divided
              by the day&apos;s BTC closing price to derive estimated BTC acquired. This assumes Strategy deploys ATM proceeds to BTC
              within 1–2 trading days, consistent with their disclosed purchasing cadence.
            </p>

            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--t2)" }}>Limitations</strong>: Estimates may overstate issuance on high-volume days driven by
              market events (earnings, index rebalancing) rather than ATM activity. Estimates are retroactively replaced with confirmed
              figures when the corresponding 8-K is filed. Inferred events (where no confirmed or estimated event exists but volume
              patterns suggest activity) carry the highest uncertainty.
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
