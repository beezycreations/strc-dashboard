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
} from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

// ── Confirmed BTC purchase history from Strategy 8-K filings ─────────
// Source: strategy.com/purchases — each row is a confirmed 8-K filing
// Fields: [reported_date, btc_acquired, avg_cost, total_cost_millions, cumulative_btc]
const CONFIRMED_PURCHASES: Array<{
  date: string;
  btc: number;
  avg_cost: number;
  cost_m: number;
  cumulative: number;
}> = [
  { date: "2020-08-11", btc: 21454, avg_cost: 11656, cost_m: 250, cumulative: 21454 },
  { date: "2020-09-14", btc: 16796, avg_cost: 10413, cost_m: 175, cumulative: 38250 },
  { date: "2020-12-04", btc: 2574, avg_cost: 19411, cost_m: 50, cumulative: 40824 },
  { date: "2020-12-21", btc: 29646, avg_cost: 21918, cost_m: 650, cumulative: 70470 },
  { date: "2021-01-22", btc: 314, avg_cost: 31847, cost_m: 10, cumulative: 70784 },
  { date: "2021-02-02", btc: 295, avg_cost: 33898, cost_m: 10, cumulative: 71079 },
  { date: "2021-02-24", btc: 19452, avg_cost: 52750, cost_m: 1026, cumulative: 90531 },
  { date: "2021-03-01", btc: 328, avg_cost: 45732, cost_m: 15, cumulative: 90859 },
  { date: "2021-03-05", btc: 205, avg_cost: 48780, cost_m: 10, cumulative: 91064 },
  { date: "2021-03-12", btc: 262, avg_cost: 57252, cost_m: 15, cumulative: 91326 },
  { date: "2021-04-05", btc: 253, avg_cost: 59288, cost_m: 15, cumulative: 91579 },
  { date: "2021-05-13", btc: 271, avg_cost: 55348, cost_m: 15, cumulative: 91850 },
  { date: "2021-05-18", btc: 229, avg_cost: 43668, cost_m: 10, cumulative: 92079 },
  { date: "2021-06-21", btc: 13005, avg_cost: 19140, cost_m: 249, cumulative: 105085 },
  { date: "2021-09-13", btc: 8957, avg_cost: 46779, cost_m: 419, cumulative: 114042 },
  { date: "2021-11-28", btc: 7002, avg_cost: 59125, cost_m: 414, cumulative: 121044 },
  { date: "2021-12-09", btc: 1434, avg_cost: 57458, cost_m: 82, cumulative: 122478 },
  { date: "2021-12-30", btc: 1914, avg_cost: 49214, cost_m: 94, cumulative: 124391 },
  { date: "2022-01-31", btc: 660, avg_cost: 37879, cost_m: 25, cumulative: 125051 },
  { date: "2022-04-05", btc: 4167, avg_cost: 45596, cost_m: 190, cumulative: 129218 },
  { date: "2022-06-28", btc: 480, avg_cost: 20833, cost_m: 10, cumulative: 129699 },
  { date: "2022-09-20", btc: 301, avg_cost: 19933, cost_m: 6, cumulative: 130000 },
  { date: "2022-12-22", btc: 2395, avg_cost: 17883, cost_m: 43, cumulative: 132395 },
  { date: "2022-12-24", btc: 810, avg_cost: 16852, cost_m: 14, cumulative: 132500 },
  { date: "2023-03-27", btc: 6455, avg_cost: 23233, cost_m: 150, cumulative: 138955 },
  { date: "2023-04-05", btc: 1045, avg_cost: 28039, cost_m: 29, cumulative: 140000 },
  { date: "2023-06-27", btc: 12333, avg_cost: 28143, cost_m: 347, cumulative: 152333 },
  { date: "2023-07-31", btc: 467, avg_cost: 30835, cost_m: 14, cumulative: 152800 },
  { date: "2023-09-24", btc: 5445, avg_cost: 27041, cost_m: 147, cumulative: 158245 },
  { date: "2023-11-01", btc: 155, avg_cost: 34194, cost_m: 5, cumulative: 158400 },
  { date: "2023-11-30", btc: 16130, avg_cost: 36801, cost_m: 593, cumulative: 174530 },
  { date: "2023-12-27", btc: 14620, avg_cost: 42118, cost_m: 616, cumulative: 189150 },
  { date: "2024-02-06", btc: 850, avg_cost: 43765, cost_m: 37, cumulative: 190000 },
  { date: "2024-02-26", btc: 3000, avg_cost: 51667, cost_m: 155, cumulative: 193000 },
  { date: "2024-03-11", btc: 12000, avg_cost: 68475, cost_m: 822, cumulative: 205000 },
  { date: "2024-03-19", btc: 9245, avg_cost: 67346, cost_m: 623, cumulative: 214246 },
  { date: "2024-05-01", btc: 164, avg_cost: 47561, cost_m: 8, cumulative: 214410 },
  { date: "2024-06-20", btc: 11931, avg_cost: 65868, cost_m: 786, cumulative: 226331 },
  { date: "2024-08-01", btc: 169, avg_cost: 67456, cost_m: 11, cumulative: 226500 },
  { date: "2024-09-13", btc: 18300, avg_cost: 60656, cost_m: 1110, cumulative: 244800 },
  { date: "2024-09-20", btc: 7420, avg_cost: 61727, cost_m: 458, cumulative: 252220 },
  { date: "2024-11-11", btc: 27200, avg_cost: 73529, cost_m: 2000, cumulative: 279420 },
  { date: "2024-11-18", btc: 51780, avg_cost: 88876, cost_m: 4600, cumulative: 331200 },
  { date: "2024-11-25", btc: 55500, avg_cost: 97297, cost_m: 5400, cumulative: 386700 },
  { date: "2024-12-02", btc: 15400, avg_cost: 97403, cost_m: 1500, cumulative: 402100 },
  { date: "2024-12-09", btc: 21550, avg_cost: 97471, cost_m: 2100, cumulative: 423650 },
  { date: "2024-12-16", btc: 15350, avg_cost: 97707, cost_m: 1500, cumulative: 439000 },
  { date: "2024-12-23", btc: 5262, avg_cost: 106603, cost_m: 561, cumulative: 444262 },
  { date: "2024-12-30", btc: 2138, avg_cost: 97847, cost_m: 209, cumulative: 446400 },
  { date: "2025-01-06", btc: 1070, avg_cost: 93458, cost_m: 100, cumulative: 447470 },
  { date: "2025-01-13", btc: 2530, avg_cost: 96047, cost_m: 243, cumulative: 450000 },
  { date: "2025-01-21", btc: 11000, avg_cost: 100000, cost_m: 1100, cumulative: 461000 },
  { date: "2025-01-27", btc: 10107, avg_cost: 108836, cost_m: 1100, cumulative: 471107 },
  { date: "2025-02-10", btc: 7633, avg_cost: 97274, cost_m: 742, cumulative: 478740 },
  { date: "2025-02-24", btc: 20356, avg_cost: 97776, cost_m: 1990, cumulative: 499096 },
  { date: "2025-03-17", btc: 130, avg_cost: 82308, cost_m: 11, cumulative: 499226 },
  { date: "2025-03-24", btc: 6911, avg_cost: 84481, cost_m: 584, cumulative: 506137 },
  { date: "2025-03-31", btc: 22048, avg_cost: 87089, cost_m: 1920, cumulative: 528185 },
  { date: "2025-04-14", btc: 3459, avg_cost: 82655, cost_m: 286, cumulative: 531644 },
  { date: "2025-04-21", btc: 6556, avg_cost: 84767, cost_m: 556, cumulative: 538200 },
  { date: "2025-04-28", btc: 15355, avg_cost: 92518, cost_m: 1420, cumulative: 553555 },
  { date: "2025-05-05", btc: 1895, avg_cost: 94973, cost_m: 180, cumulative: 555450 },
  { date: "2025-05-12", btc: 13390, avg_cost: 100149, cost_m: 1340, cumulative: 568840 },
  { date: "2025-05-19", btc: 7390, avg_cost: 103511, cost_m: 765, cumulative: 576230 },
  { date: "2025-05-26", btc: 4020, avg_cost: 106294, cost_m: 427, cumulative: 580250 },
  { date: "2025-06-02", btc: 705, avg_cost: 106383, cost_m: 75, cumulative: 580955 },
  { date: "2025-06-16", btc: 10100, avg_cost: 104059, cost_m: 1051, cumulative: 590000 },
  { date: "2025-06-23", btc: 2100, avg_cost: 106122, cost_m: 223, cumulative: 592100 },
  { date: "2025-07-14", btc: 4225, avg_cost: 111695, cost_m: 472, cumulative: 601550 },
  { date: "2025-07-21", btc: 6220, avg_cost: 118975, cost_m: 740, cumulative: 607770 },
  { date: "2025-07-29", btc: 21021, avg_cost: 117257, cost_m: 2465, cumulative: 628791 },
  { date: "2025-08-11", btc: 155, avg_cost: 116129, cost_m: 18, cumulative: 629096 },
  { date: "2025-08-18", btc: 430, avg_cost: 118605, cost_m: 51, cumulative: 629376 },
  { date: "2025-08-25", btc: 3081, avg_cost: 115877, cost_m: 357, cumulative: 632457 },
  { date: "2025-09-02", btc: 4048, avg_cost: 110939, cost_m: 449, cumulative: 636505 },
  { date: "2025-09-08", btc: 1955, avg_cost: 110998, cost_m: 217, cumulative: 638460 },
  { date: "2025-09-15", btc: 525, avg_cost: 114286, cost_m: 60, cumulative: 638985 },
  { date: "2025-09-22", btc: 850, avg_cost: 117647, cost_m: 100, cumulative: 639835 },
  { date: "2025-09-29", btc: 196, avg_cost: 113048, cost_m: 22, cumulative: 640031 },
  { date: "2025-10-13", btc: 220, avg_cost: 123561, cost_m: 27, cumulative: 640250 },
  { date: "2025-10-20", btc: 168, avg_cost: 112051, cost_m: 19, cumulative: 640418 },
  { date: "2025-10-27", btc: 390, avg_cost: 111053, cost_m: 43, cumulative: 640808 },
  { date: "2025-11-03", btc: 397, avg_cost: 114771, cost_m: 46, cumulative: 641205 },
  { date: "2025-11-10", btc: 487, avg_cost: 102663, cost_m: 50, cumulative: 641692 },
  { date: "2025-11-17", btc: 8178, avg_cost: 102225, cost_m: 836, cumulative: 649870 },
  { date: "2025-12-01", btc: 130, avg_cost: 92308, cost_m: 12, cumulative: 650000 },
  { date: "2025-12-08", btc: 10624, avg_cost: 90617, cost_m: 963, cumulative: 660624 },
  { date: "2025-12-15", btc: 10645, avg_cost: 92057, cost_m: 980, cumulative: 671268 },
  { date: "2025-12-29", btc: 1229, avg_cost: 88777, cost_m: 109, cumulative: 672497 },
  { date: "2026-01-05", btc: 1283, avg_cost: 90391, cost_m: 116, cumulative: 673783 },
  { date: "2026-01-12", btc: 13627, avg_cost: 91519, cost_m: 1247, cumulative: 687410 },
  { date: "2026-01-20", btc: 22305, avg_cost: 95284, cost_m: 2125, cumulative: 709715 },
  { date: "2026-01-26", btc: 2932, avg_cost: 90061, cost_m: 264, cumulative: 712647 },
  { date: "2026-02-02", btc: 855, avg_cost: 87974, cost_m: 75, cumulative: 713502 },
  { date: "2026-02-09", btc: 1142, avg_cost: 78815, cost_m: 90, cumulative: 714644 },
  { date: "2026-02-17", btc: 2486, avg_cost: 67540, cost_m: 168, cumulative: 717131 },
  { date: "2026-02-23", btc: 592, avg_cost: 67568, cost_m: 40, cumulative: 717722 },
  { date: "2026-03-02", btc: 3015, avg_cost: 67700, cost_m: 204, cumulative: 720737 },
  { date: "2026-03-09", btc: 17994, avg_cost: 70946, cost_m: 1277, cumulative: 738731 },
];

// Latest confirmed cumulative total
const LATEST_CONFIRMED_BTC = CONFIRMED_PURCHASES[CONFIRMED_PURCHASES.length - 1].cumulative;
const LATEST_CONFIRMED_DATE = CONFIRMED_PURCHASES[CONFIRMED_PURCHASES.length - 1].date;

interface CumulativeDay {
  date: string;
  strc_cumulative_usd: number;
  mstr_cumulative_usd: number;
}

export default function BtcPurchaseChart() {
  const { data, isLoading } = useVolumeAtm();
  const { data: snap } = useSnapshot();
  const [range, setRange] = useState<"3m" | "6m" | "1y" | "all">("3m");

  const btcPrice = snap?.btc_price ?? 83000;

  const chartData = useMemo(() => {
    // Determine date range
    const now = new Date();
    const cutoff =
      range === "3m"
        ? new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        : range === "6m"
          ? new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
          : range === "1y"
            ? new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
            : new Date("2020-08-01");
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Filter confirmed purchases within range
    const purchasesInRange = CONFIRMED_PURCHASES.filter((p) => p.date >= cutoffStr);

    // Find the starting cumulative BTC (just before our range)
    const purchasesBefore = CONFIRMED_PURCHASES.filter((p) => p.date < cutoffStr);
    const startingCumulative = purchasesBefore.length > 0
      ? purchasesBefore[purchasesBefore.length - 1].cumulative
      : 0;

    // Build confirmed data points
    const result: Array<{
      date: string;
      btc_confirmed: number;
      btc_estimated: number;
      btc_cumulative: number;
      cost_m: number;
      avg_cost: number;
      source: "confirmed" | "estimated";
    }> = [];

    for (const p of purchasesInRange) {
      result.push({
        date: p.date,
        btc_confirmed: p.btc,
        btc_estimated: 0,
        btc_cumulative: p.cumulative,
        cost_m: p.cost_m,
        avg_cost: p.avg_cost,
        source: "confirmed",
      });
    }

    // After the last confirmed purchase, add daily estimates from ATM data
    const cumulative = (data?.cumulative_atm ?? []) as CumulativeDay[];
    if (cumulative.length >= 2) {
      let runningBtc = LATEST_CONFIRMED_BTC;

      for (let i = 1; i < cumulative.length; i++) {
        const prev = cumulative[i - 1];
        const curr = cumulative[i];

        // Only add estimates for dates after the last confirmed purchase
        if (curr.date <= LATEST_CONFIRMED_DATE) continue;
        if (curr.date < cutoffStr) continue;

        const dailyMstrAtm = Math.max(0, curr.mstr_cumulative_usd - prev.mstr_cumulative_usd);
        const dailyStrcAtm = Math.max(0, curr.strc_cumulative_usd - prev.strc_cumulative_usd);
        // Strategy deploys ~95% of all ATM proceeds to BTC
        const totalAtmUsd = (dailyMstrAtm + dailyStrcAtm) * 0.95;
        const estBtc = totalAtmUsd / btcPrice;

        if (estBtc > 0) {
          runningBtc += estBtc;
          result.push({
            date: curr.date,
            btc_confirmed: 0,
            btc_estimated: estBtc,
            btc_cumulative: runningBtc,
            cost_m: totalAtmUsd / 1e6,
            avg_cost: btcPrice,
            source: "estimated",
          });
        }
      }
    }

    // Sort by date
    result.sort((a, b) => a.date.localeCompare(b.date));

    // Ensure cumulative line is monotonically correct by forward-filling
    // For "all" view, insert the starting point if needed
    if (result.length > 0 && result[0].btc_cumulative === 0) {
      result[0].btc_cumulative = startingCumulative + result[0].btc_confirmed;
    }

    return result;
  }, [data?.cumulative_atm, range, btcPrice]);

  const tickInterval = Math.max(1, Math.floor(chartData.length / 12));

  // Summary stats for the visible range
  const totalBtcInRange = chartData.reduce((s, d) => s + d.btc_confirmed + d.btc_estimated, 0);
  const totalCostInRange = chartData.reduce((s, d) => s + d.cost_m, 0);
  const confirmedCount = chartData.filter((d) => d.source === "confirmed").length;
  const estimatedCount = chartData.filter((d) => d.source === "estimated").length;
  const latestCumulative = chartData.length > 0 ? chartData[chartData.length - 1].btc_cumulative : LATEST_CONFIRMED_BTC;

  // Overall totals from full history
  const totalCostAll = CONFIRMED_PURCHASES.reduce((s, p) => s + p.cost_m, 0);
  const avgCostBasis = totalCostAll > 0 ? (totalCostAll * 1e6) / LATEST_CONFIRMED_BTC : 0;

  if (isLoading || !data) {
    return <div className="card"><div className="skeleton" style={{ height: 480 }} /></div>;
  }

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Strategy Bitcoin Purchases</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 2 }}>
            Source: strategy.com/purchases — 8-K confirmed acquisitions + daily estimates
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["3m", "6m", "1y", "all"] as const).map((r) => (
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KpiMini
          label="Total BTC Holdings"
          value={`${latestCumulative.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          highlight
        />
        <KpiMini
          label="Aggregate Cost"
          value={`$${(totalCostAll / 1000).toFixed(1)}B`}
        />
        <KpiMini
          label="Avg Cost Basis"
          value={`$${avgCostBasis.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
        <KpiMini
          label={`BTC in Period (${range.toUpperCase()})`}
          value={`${totalBtcInRange.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
        <KpiMini
          label={`Cost in Period`}
          value={`$${(totalCostInRange / 1000).toFixed(2)}B`}
        />
        <KpiMini
          label="Confirmed / Est."
          value={`${confirmedCount} / ${estimatedCount}`}
        />
      </div>

      {/* Chart */}
      <div style={{ height: 340, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 60, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: string) => {
                const d = new Date(v + "T00:00:00");
                return range === "all" || range === "1y"
                  ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
                  : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
              interval={tickInterval}
            />
            {/* Left Y-axis: BTC per purchase event */}
            <YAxis
              yAxisId="daily"
              tick={{ fontSize: 10, fill: colors.btc, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`}
              width={50}
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
                  case "btc_confirmed": return [`${v.toLocaleString()} BTC`, "Purchased (8-K)"];
                  case "btc_estimated": return [`${v.toFixed(0)} BTC`, "Purchased (Est.)"];
                  case "btc_cumulative": return [`${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC`, "Total Holdings"];
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
                  case "btc_cumulative": return "Total Holdings";
                  default: return value;
                }
              }}
            />
            {/* Confirmed BTC bars (green) */}
            <Bar
              yAxisId="daily"
              dataKey="btc_confirmed"
              fill={colors.green}
              opacity={0.85}
              radius={[2, 2, 0, 0]}
              stackId="btc"
            />
            {/* Estimated BTC bars (amber) */}
            <Bar
              yAxisId="daily"
              dataKey="btc_estimated"
              fill={colors.amber}
              opacity={0.7}
              radius={[2, 2, 0, 0]}
              stackId="btc"
            />
            {/* Cumulative BTC line */}
            <Line
              yAxisId="cumulative"
              type="stepAfter"
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
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)" }}>
            Recent Purchase Events
          </span>
          <Badge variant="neutral">{CONFIRMED_PURCHASES.length} total</Badge>
        </div>
        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          {[...CONFIRMED_PURCHASES].reverse().slice(0, 15).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: "var(--text-xs)", alignItems: "center" }}>
              <span style={{ color: "var(--t3)", minWidth: 72 }}>{p.date}</span>
              <span className="mono" style={{ color: colors.btc, fontWeight: 600, minWidth: 72 }}>
                +{p.btc.toLocaleString()} BTC
              </span>
              <span className="mono" style={{ color: "var(--t2)", minWidth: 55 }}>
                ${p.cost_m >= 1000 ? `${(p.cost_m / 1000).toFixed(2)}B` : `${p.cost_m}M`}
              </span>
              <span className="mono" style={{ color: "var(--t3)", minWidth: 55 }}>
                @${(p.avg_cost / 1000).toFixed(1)}K
              </span>
              <span className="mono" style={{ color: "var(--t3)", fontSize: "var(--text-xs)" }}>
                = {p.cumulative.toLocaleString()}
              </span>
              <Badge variant="green">8-K</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiMini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 2 }}>{label}</div>
      <span className="mono" style={{
        fontSize: highlight ? "var(--text-lg)" : "var(--text-base)",
        fontWeight: 600,
        color: highlight ? colors.btc : undefined,
      }}>{value}</span>
    </div>
  );
}
