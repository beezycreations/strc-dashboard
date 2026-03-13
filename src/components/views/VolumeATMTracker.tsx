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
// ATM issuance is nearly continuous for STRC — Strategy issues most trading days.
// Base estimation applies participation rate to ALL volume.
// High-confidence days (volume > threshold × avg) get a higher participation rate.
const HIGH_CONFIDENCE_THRESHOLD = 1.5;
const HIGH_CONFIDENCE_MULTIPLIER = 1.5; // participation rate × 1.5 on spike days

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

  // Build ATM event lookup by date and identify confirmed date ranges
  const { atmEventMap, confirmedRanges } = useMemo(() => {
    const map = new Map<string, AtmEvent>();
    const events = (data?.atm_events ?? []) as AtmEvent[];
    for (const evt of events) {
      map.set(evt.date, evt);
    }

    // Build confirmed 8-K date ranges.
    // Each confirmed event is assumed to cover the period from the previous
    // confirmed event's date (exclusive) to its own date (inclusive).
    // Within that range, prior estimates/inferred values get replaced and
    // the confirmed total is allocated proportionally by daily volume.
    const confirmed = events
      .filter((e) => !e.is_estimated)
      .sort((a, b) => a.date.localeCompare(b.date));

    const ranges: Array<{ start: string; end: string; proceeds_usd: number; shares_issued: number }> = [];
    for (let i = 0; i < confirmed.length; i++) {
      const prev = i > 0 ? confirmed[i - 1].date : null;
      ranges.push({
        start: prev ?? confirmed[i].date, // first confirmed event covers just its own day
        end: confirmed[i].date,
        proceeds_usd: confirmed[i].proceeds_usd,
        shares_issued: confirmed[i].shares_issued,
      });
    }

    return { atmEventMap: map, confirmedRanges: ranges };
  }, [data?.atm_events]);

  // Compute chart data with 8-K reconciliation
  const chartData = useMemo(() => {
    const allVolume = (data?.volume_history ?? []) as VolumeDay[];

    // Step 1: Build raw daily estimates for every day
    const rawDays = filteredVolume.map((v) => {
      const fullIdx = allVolume.findIndex((x) => x.date === v.date);
      const lookback = allVolume.slice(Math.max(0, fullIdx - 19), fullIdx + 1);
      const avg20d = lookback.length > 0
        ? lookback.reduce((s, x) => s + x.strc_volume, 0) / lookback.length
        : v.strc_volume;

      // Check for a pre-existing estimated event from the API
      const atmEvent = atmEventMap.get(v.date);

      // Default: estimate from volume × participation rate
      const isHighConfidence = v.strc_volume > avg20d * HIGH_CONFIDENCE_THRESHOLD;
      const effectiveRate = isHighConfidence
        ? participationRate * HIGH_CONFIDENCE_MULTIPLIER
        : participationRate;
      const inferredProceeds = v.strc_volume * effectiveRate * v.strc_price;

      return {
        date: v.date,
        strc_volume: v.strc_volume,
        mstr_volume: v.mstr_volume,
        strc_price: v.strc_price,
        avg_20d: Math.round(avg20d),
        // These will be overwritten by reconciliation if within a confirmed range
        atm_proceeds: atmEvent ? atmEvent.proceeds_usd : inferredProceeds,
        atm_source: atmEvent
          ? (atmEvent.is_estimated ? "estimated" as const : "confirmed" as const)
          : "inferred" as const,
      };
    });

    // Step 2: Reconcile — for each confirmed 8-K range, override daily estimates
    // so they sum to the confirmed total, allocated by volume weight.
    for (const range of confirmedRanges) {
      const daysInRange = rawDays.filter(
        (d) => d.date > range.start && d.date <= range.end
      );
      // If the range start === end (single-day confirmation), include that day
      if (range.start === range.end) {
        const singleDay = rawDays.find((d) => d.date === range.end);
        if (singleDay && !daysInRange.includes(singleDay)) {
          daysInRange.push(singleDay);
        }
      }

      if (daysInRange.length === 0) continue;

      const totalVolume = daysInRange.reduce((s, d) => s + d.strc_volume, 0);
      if (totalVolume === 0) continue;

      // Allocate confirmed proceeds proportionally by daily volume
      for (const day of daysInRange) {
        const weight = day.strc_volume / totalVolume;
        day.atm_proceeds = range.proceeds_usd * weight;
        day.atm_source = "confirmed";
      }
    }

    // Step 3: Compute final fields
    return rawDays.map((d) => ({
      date: d.date,
      strc_volume: d.strc_volume,
      mstr_volume: d.mstr_volume,
      strc_price: d.strc_price,
      avg_20d: d.avg_20d,
      atm_proceeds_confirmed: d.atm_source === "confirmed" ? d.atm_proceeds / 1e6 : 0,
      atm_proceeds_estimated: d.atm_source !== "confirmed" ? d.atm_proceeds / 1e6 : 0,
      atm_btc: d.atm_proceeds / btcPrice,
      atm_source: d.atm_source,
    }));
  }, [filteredVolume, atmEventMap, confirmedRanges, data?.volume_history, participationRate, btcPrice]);

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
              <strong style={{ color: "var(--t2)" }}>Estimated events</strong> (<Badge variant="amber">Est.</Badge>): Strategy&apos;s ATM programs operate
              near-continuously — shares are issued on most trading days, not just during volume spikes. We estimate daily issuance
              by applying a calibrated participation rate to total daily volume. On high-volume days (exceeding {HIGH_CONFIDENCE_THRESHOLD}× the
              20-day average), the participation rate is scaled up by {HIGH_CONFIDENCE_MULTIPLIER}× to reflect that elevated volume often
              correlates with more aggressive issuance.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Estimation formula</strong>:
            </p>
            <div className="mono" style={{ background: "var(--bg-raised)", padding: "10px 14px", borderRadius: "var(--r-sm)", marginBottom: 10, fontSize: "var(--text-xs)", lineHeight: 1.8 }}>
              <div>effective_rate = participation_rate × (1.5 if volume &gt; 1.5× 20d_avg, else 1.0)</div>
              <div>est_shares = daily_volume × effective_rate</div>
              <div>est_proceeds = est_shares × VWAP</div>
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

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>8-K reconciliation</strong>: When a confirmed 8-K filing is received, it overrides all
              prior daily estimates within its coverage period. The confirmed total proceeds are re-allocated across the trading days
              in that range proportionally by each day&apos;s STRC volume. This ensures the chart always ties back to actuals once official
              data is available, while preserving a realistic daily breakdown based on volume patterns.
            </p>

            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--t2)" }}>Limitations</strong>: Estimates may overstate issuance on high-volume days driven by
              market events (earnings, index rebalancing) rather than ATM activity. Inferred events carry the highest uncertainty.
              All estimates are provisional and will be replaced by confirmed figures as 8-K filings are processed (typically 2–5
              business days after issuance).
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
