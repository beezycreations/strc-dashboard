"use client";

import { useState, useMemo } from "react";
import { useVolumeAtm, useSnapshot } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

// Participation rate for MSTR common ATM → BTC conversion
// Strategy deploys essentially all MSTR ATM proceeds to BTC within 1-2 days
const MSTR_BTC_CONVERSION_RATE = 0.95; // ~95% of ATM proceeds go to BTC

interface CumulativeDay {
  date: string;
  strc_cumulative_usd: number;
  mstr_cumulative_usd: number;
}

interface BtcPurchaseEvent {
  date: string;
  period_start: string;
  period_end: string;
  btc_purchased: number;
  total_cost_usd: number;
  avg_btc_price: number;
  is_confirmed: boolean;
}

// Mock confirmed 8-K BTC purchase events
// In production, these come from SEC EDGAR 8-K filings
const MOCK_BTC_PURCHASES: BtcPurchaseEvent[] = [
  { date: "2026-03-10", period_start: "2026-03-03", period_end: "2026-03-10", btc_purchased: 12_000, total_cost_usd: 984_000_000, avg_btc_price: 82_000, is_confirmed: false },
  { date: "2026-03-03", period_start: "2026-02-24", period_end: "2026-03-03", btc_purchased: 15_400, total_cost_usd: 1_278_200_000, avg_btc_price: 83_000, is_confirmed: true },
  { date: "2026-02-24", period_start: "2026-02-18", period_end: "2026-02-24", btc_purchased: 11_200, total_cost_usd: 940_800_000, avg_btc_price: 84_000, is_confirmed: true },
  { date: "2026-02-18", period_start: "2026-02-10", period_end: "2026-02-18", btc_purchased: 17_994, total_cost_usd: 1_439_520_000, avg_btc_price: 80_000, is_confirmed: true },
];

export default function BtcPurchaseChart() {
  const { data, isLoading } = useVolumeAtm();
  const { data: snap } = useSnapshot();
  const [range, setRange] = useState<"1m" | "3m" | "all">("3m");

  const btcPrice = snap?.btc_price ?? 83000;

  // Derive daily BTC purchases from cumulative MSTR ATM data
  const chartData = useMemo(() => {
    const cumulative = (data?.cumulative_atm ?? []) as CumulativeDay[];
    if (cumulative.length < 2) return [];

    // Filter by range
    const now = new Date();
    const cutoff =
      range === "1m"
        ? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        : range === "3m"
          ? new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
          : new Date("2025-07-29");
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Build confirmed purchase map — each confirmed event covers its period
    const confirmedEvents = MOCK_BTC_PURCHASES.filter((e) => e.is_confirmed)
      .sort((a, b) => a.period_start.localeCompare(b.period_start));

    // Find the latest confirmed date — everything on or before is "actual"
    const latestConfirmedDate = confirmedEvents.length > 0
      ? confirmedEvents[confirmedEvents.length - 1].period_end
      : null;

    // Step 1: Compute raw daily estimates from cumulative ATM delta
    const rawDays: Array<{
      date: string;
      daily_atm_usd: number;
      btc_purchased: number;
      source: "confirmed" | "estimated";
    }> = [];

    for (let i = 1; i < cumulative.length; i++) {
      const prev = cumulative[i - 1];
      const curr = cumulative[i];
      if (curr.date < cutoffStr) continue;

      const dailyMstrAtm = Math.max(0, curr.mstr_cumulative_usd - prev.mstr_cumulative_usd);
      // Also include STRC ATM proceeds that get converted to equity → BTC
      const dailyStrcAtm = Math.max(0, curr.strc_cumulative_usd - prev.strc_cumulative_usd);
      const totalAtmUsd = (dailyMstrAtm + dailyStrcAtm) * MSTR_BTC_CONVERSION_RATE;
      const estBtc = totalAtmUsd / btcPrice;

      rawDays.push({
        date: curr.date,
        daily_atm_usd: totalAtmUsd,
        btc_purchased: estBtc,
        source: "estimated",
      });
    }

    // Step 2: Reconcile with confirmed 8-K BTC purchases
    // Within each confirmed period, allocate the confirmed BTC total
    // proportionally by each day's estimated ATM $ (volume-weighted)
    for (const event of confirmedEvents) {
      const daysInRange = rawDays.filter(
        (d) => d.date > event.period_start && d.date <= event.period_end
      );
      if (daysInRange.length === 0) continue;

      const totalEstAtm = daysInRange.reduce((s, d) => s + d.daily_atm_usd, 0);
      if (totalEstAtm === 0) continue;

      for (const day of daysInRange) {
        const weight = day.daily_atm_usd / totalEstAtm;
        day.btc_purchased = event.btc_purchased * weight;
        day.daily_atm_usd = event.total_cost_usd * weight;
        day.source = "confirmed";
      }
    }

    // Step 3: Mark all days before latest confirmed as confirmed
    if (latestConfirmedDate) {
      for (const day of rawDays) {
        if (day.date <= latestConfirmedDate && day.source !== "confirmed") {
          day.source = "confirmed";
        }
      }
    }

    // Step 4: Build chart-ready data with cumulative total
    let cumulativeBtc = 0;
    return rawDays.map((d) => {
      cumulativeBtc += d.btc_purchased;
      return {
        date: d.date,
        btc_confirmed: d.source === "confirmed" ? d.btc_purchased : 0,
        btc_estimated: d.source === "estimated" ? d.btc_purchased : 0,
        btc_cumulative: cumulativeBtc,
        daily_cost_usd: d.daily_atm_usd,
        source: d.source,
      };
    });
  }, [data?.cumulative_atm, range, btcPrice]);

  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  // Summary stats
  const totalBtc = chartData.reduce((s, d) => s + d.btc_confirmed + d.btc_estimated, 0);
  const totalCost = chartData.reduce((s, d) => s + d.daily_cost_usd, 0);
  const confirmedDays = chartData.filter((d) => d.source === "confirmed").length;
  const estimatedDays = chartData.filter((d) => d.source === "estimated").length;
  const avgDailyBtc = chartData.length > 0 ? totalBtc / chartData.length : 0;

  if (isLoading || !data) {
    return <div className="card"><div className="skeleton" style={{ height: 420 }} /></div>;
  }

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>MSTR Bitcoin Purchases</div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KpiMini label="Total BTC Purchased" value={`${totalBtc.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC`} />
        <KpiMini label="Total Cost" value={`$${(totalCost / 1e9).toFixed(2)}B`} />
        <KpiMini label="Avg Daily" value={`${avgDailyBtc.toFixed(0)} BTC/day`} />
        <KpiMini label="Avg Cost Basis" value={totalBtc > 0 ? `$${(totalCost / totalBtc).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"} />
        <KpiMini label="Confirmed / Est." value={`${confirmedDays} / ${estimatedDays}`} />
      </div>

      {/* Chart */}
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
            {/* Left Y-axis: Daily BTC purchased */}
            <YAxis
              yAxisId="daily"
              tick={{ fontSize: 10, fill: colors.btc, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => `${v.toLocaleString()}`}
              width={55}
              label={{ value: "Daily BTC", angle: -90, position: "insideLeft", style: { fontSize: 9, fill: colors.t3 } }}
            />
            {/* Right Y-axis: Cumulative BTC */}
            <YAxis
              yAxisId="cumulative"
              orientation="right"
              tick={{ fontSize: 10, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
              width={50}
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
                  case "btc_confirmed": return [`${v.toFixed(1)} BTC`, "BTC Purchased (8-K)"];
                  case "btc_estimated": return [`${v.toFixed(1)} BTC`, "BTC Purchased (Est.)"];
                  case "btc_cumulative": return [`${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC`, "Cumulative"];
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
                  case "btc_confirmed": return "8-K Confirmed";
                  case "btc_estimated": return "Estimated";
                  case "btc_cumulative": return "Cumulative";
                  default: return value;
                }
              }}
            />
            {/* Zero line */}
            <ReferenceLine yAxisId="daily" y={0} stroke={colors.t3} strokeDasharray="3 3" />
            {/* Confirmed BTC bars (green) */}
            <Bar
              yAxisId="daily"
              dataKey="btc_confirmed"
              fill={colors.green}
              opacity={0.85}
              barSize={6}
              radius={[2, 2, 0, 0]}
              stackId="btc"
            />
            {/* Estimated BTC bars (amber) */}
            <Bar
              yAxisId="daily"
              dataKey="btc_estimated"
              fill={colors.amber}
              opacity={0.7}
              barSize={6}
              radius={[2, 2, 0, 0]}
              stackId="btc"
            />
            {/* Cumulative BTC line */}
            <Line
              yAxisId="cumulative"
              type="monotone"
              dataKey="btc_cumulative"
              stroke={colors.btc}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: colors.btc, fill: "#fff" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Purchase Events Table */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)" }}>BTC Purchase Events</span>
          <Badge variant="neutral">{MOCK_BTC_PURCHASES.length}</Badge>
        </div>
        <div style={{ maxHeight: 180, overflowY: "auto" }}>
          {[...MOCK_BTC_PURCHASES].sort((a, b) => b.date.localeCompare(a.date)).map((evt, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: "var(--text-xs)", alignItems: "center" }}>
              <span style={{ color: "var(--t3)", minWidth: 68 }}>
                {evt.period_start.slice(5)} — {evt.period_end.slice(5)}
              </span>
              <span className="mono" style={{ color: colors.btc, fontWeight: 600, minWidth: 65 }}>
                {evt.btc_purchased.toLocaleString()} BTC
              </span>
              <span className="mono" style={{ color: "var(--t2)", minWidth: 55 }}>
                ${(evt.total_cost_usd / 1e9).toFixed(2)}B
              </span>
              <span className="mono" style={{ color: "var(--t3)", minWidth: 55 }}>
                @${(evt.avg_btc_price / 1000).toFixed(1)}K
              </span>
              {evt.is_confirmed ? (
                <Badge variant="green">8-K</Badge>
              ) : (
                <Badge variant="amber">Est.</Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 2 }}>{label}</div>
      <span className="mono" style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
