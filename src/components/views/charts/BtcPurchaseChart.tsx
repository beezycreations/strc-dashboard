"use client";

import { useState, useMemo } from "react";
import { useSnapshot } from "@/src/lib/hooks/use-api";
import Badge from "@/src/components/ui/Badge";
import {
  forecastBtcHoldings,
  getWeightedDailyPace,
  getEngineSummary,
  backtestPaceModel,
  getDailyEstimates,
} from "@/src/lib/calculators/issuance-engine";
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
import {
  CONFIRMED_PURCHASES,
  LATEST_CONFIRMED_BTC,
  LATEST_CONFIRMED_DATE,
} from "@/src/lib/data/confirmed-purchases";

export default function BtcPurchaseChart() {
  const { data: snap, isLoading } = useSnapshot();
  const [range, setRange] = useState<"3m" | "6m" | "1y" | "all">("3m");
  const [showMethodology, setShowMethodology] = useState(false);

  const btcPrice = snap?.btc_price ?? 83000;

  // 8-K-derived engine data (no mock dependency)
  const holdings = useMemo(() => forecastBtcHoldings(btcPrice), [btcPrice]);
  const engineSummary = useMemo(() => getEngineSummary(), []);
  const pace = useMemo(() => getWeightedDailyPace(), []);
  const paceBacktest = useMemo(() => backtestPaceModel(), []);

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

    // After the last confirmed purchase, add daily estimates from issuance engine
    const todayStr = now.toISOString().slice(0, 10);
    if (LATEST_CONFIRMED_DATE < todayStr) {
      const estimates = getDailyEstimates(LATEST_CONFIRMED_DATE, todayStr, btcPrice);
      const postConfirmed = estimates.filter((e) => e.date > LATEST_CONFIRMED_DATE);

      let runningBtc = LATEST_CONFIRMED_BTC;

      for (const est of postConfirmed) {
        if (est.date < cutoffStr) continue;
        if (est.btc_estimate > 0) {
          runningBtc += est.btc_estimate;
          result.push({
            date: est.date,
            btc_confirmed: 0,
            btc_estimated: est.btc_estimate,
            btc_cumulative: runningBtc,
            cost_m: est.total_proceeds / 1e6,
            avg_cost: btcPrice,
            source: "estimated",
          });
        }
      }
    }

    // Sort by date
    result.sort((a, b) => a.date.localeCompare(b.date));

    // Ensure cumulative line is monotonically correct
    if (result.length > 0 && result[0].btc_cumulative === 0) {
      result[0].btc_cumulative = startingCumulative + result[0].btc_confirmed;
    }

    return result;
  }, [range, btcPrice]);

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

  if (isLoading) {
    return <div className="card"><div className="skeleton" style={{ height: 480 }} /></div>;
  }

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Strategy Bitcoin Purchases</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 2 }}>
            Source: strategy.com/purchases
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
      <div style={{ height: 300, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
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
              tick={{ fontSize: 9, fill: colors.btc, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`}
              width={40}
            />
            {/* Right Y-axis: Cumulative BTC */}
            <YAxis
              yAxisId="cumulative"
              orientation="right"
              tick={{ fontSize: 9, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
              width={40}
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
        <div style={{ maxHeight: 200, overflowY: "auto", overflowX: "auto" }}>
          {[...CONFIRMED_PURCHASES].reverse().slice(0, 15).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: "var(--text-xs)", alignItems: "center", minWidth: "fit-content" }}>
              <span style={{ color: "var(--t3)", whiteSpace: "nowrap" }}>{p.date}</span>
              <span className="mono" style={{ color: colors.btc, fontWeight: 600, whiteSpace: "nowrap" }}>
                +{p.btc.toLocaleString()}
              </span>
              <span className="mono" style={{ color: "var(--t2)", whiteSpace: "nowrap" }}>
                ${p.cost_m >= 1000 ? `${(p.cost_m / 1000).toFixed(2)}B` : `${p.cost_m}M`}
              </span>
              <span className="mono" style={{ color: "var(--t3)", whiteSpace: "nowrap" }}>
                @${(p.avg_cost / 1000).toFixed(1)}K
              </span>
              <span className="mono" style={{ color: "var(--t3)", whiteSpace: "nowrap" }}>
                ={p.cumulative.toLocaleString()}
              </span>
              <Badge variant="green">8-K</Badge>
            </div>
          ))}
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
          BTC Purchase Estimation Methodology
        </button>
        {showMethodology && (
          <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--t3)", lineHeight: 1.6 }}>
            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Data source</strong>: Confirmed purchases (<Badge variant="green">8-K</Badge>) are sourced
              directly from Strategy&apos;s SEC 8-K filings and the official purchase history
              at <span className="mono">strategy.com/purchases</span>. Each filing reports exact BTC acquired, total cost,
              and weighted-average purchase price for a specific reporting period.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>The 8-K Estimation Chain</strong>: BTC purchase estimates are derived from the unified
              issuance engine, which computes all parameters directly from confirmed 8-K filings:
            </p>
            <div className="mono" style={{ background: "var(--bg-raised)", padding: "10px 14px", borderRadius: "var(--r-sm)", marginBottom: 10, fontSize: "var(--text-xs)", lineHeight: 1.8 }}>
              <div>1. 8-K confirmed data → exponentially-weighted daily pace</div>
              <div>   Weighted daily proceeds: ${(pace.total_daily / 1e6).toFixed(1)}M (STRC: {(pace.strc_share * 100).toFixed(0)}% + MSTR: {((1 - pace.strc_share) * 100).toFixed(0)}%)</div>
              <div>2. Daily proceeds × {(pace.conversion_rate * 100).toFixed(0)}% conversion → BTC/day at current price</div>
              <div>   Est. BTC/day: {(pace.total_daily * pace.conversion_rate / btcPrice).toFixed(1)} BTC @ ${btcPrice.toLocaleString()}</div>
              <div>3. Confirmed {holdings.confirmed_btc.toLocaleString()} BTC + {holdings.estimated_btc_since.toLocaleString()} est. ({holdings.forecast_days} trading days)</div>
              <div>   = {holdings.total_estimated_btc.toLocaleString()} total estimated holdings</div>
              <div>   Confidence: {holdings.confidence}% ({holdings.confidence_label})</div>
              <div>4. Feeds → mNAV, BTC coverage, impairment calculations</div>
            </div>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Why 8-K-derived, not volume-based</strong>: The issuance engine derives daily pace
              directly from confirmed 8-K filings, avoiding any dependency on trading volume data (which may be unavailable or mock).
              The conversion rate ({(pace.conversion_rate * 100).toFixed(0)}%) is observed from 8-K data, not assumed.
              Management has guided ~25% ATM participation relative to daily trading volume; when real DB volume data is available,
              this rate is used as an alternative estimation path.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Cross-validation</strong>: Leave-one-out backtest across {paceBacktest.periods} 8-K periods
              yields {paceBacktest.mape.toFixed(1)}% MAPE with {paceBacktest.bias > 0 ? "+" : ""}{paceBacktest.bias.toFixed(1)}% bias.
              The model recalibrates automatically when new 8-K data is added to the confirmed data files.
            </p>

            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>8-K reconciliation</strong>: When a new 8-K filing is published, all prior
              estimates are replaced by confirmed figures, the cumulative total resets, and confidence returns
              to 100%. Strategy typically files 8-Ks weekly, so estimates are usually outstanding for 5–10 trading days.
            </p>

            <p style={{ margin: 0, marginTop: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Limitations</strong>: The pace model assumes relatively stable issuance, but actual
              daily proceeds vary dramatically ($1.4M–$236M/day across confirmed periods). The conversion
              rate may vary as Strategy retains proceeds for operating expenses or debt service. All estimates are
              provisional and will be replaced by confirmed figures as 8-K filings are processed.
            </p>
          </div>
        )}
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
