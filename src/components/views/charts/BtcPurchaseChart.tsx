"use client";

import { useState, useMemo } from "react";
import { useSnapshot, useVolumeAtm } from "@/src/lib/hooks/use-api";
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
import {
  CONFIRMED_PURCHASES,
  LATEST_CONFIRMED_BTC,
} from "@/src/lib/data/confirmed-purchases";

// STRC IPO date — flywheel takes over as the single source from this date
const STRC_IPO_DATE = "2025-07-29";

// BTC holdings just before IPO (last pre-IPO confirmed purchase)
const PRE_IPO_PURCHASES = CONFIRMED_PURCHASES.filter((p) => p.date < STRC_IPO_DATE);
const PRE_IPO_CUMULATIVE = PRE_IPO_PURCHASES.length > 0
  ? PRE_IPO_PURCHASES[PRE_IPO_PURCHASES.length - 1].cumulative
  : 0;

interface FlywheelDay {
  date: string;
  btc_purchased: number;
  strc_issuance_confirmed: number;
  strc_issuance_estimated: number;
  mstr_issuance_estimated: number;
  source: "confirmed" | "estimated";
}

interface ChartPoint {
  date: string;
  btc_confirmed: number;
  btc_estimated: number;
  btc_cumulative: number;
  cost_m: number;
  avg_cost: number;
}

export default function BtcPurchaseChart() {
  const { data: snap, isLoading: snapLoading } = useSnapshot();
  const { data: volumeAtm, isLoading: volumeLoading } = useVolumeAtm();
  const [range, setRange] = useState<"3m" | "6m" | "1y" | "all">("3m");
  const [showMethodology, setShowMethodology] = useState(false);

  const btcPrice = snap?.btc_price ?? 83000;
  const flywheelDays: FlywheelDay[] = volumeAtm?.flywheel_days ?? [];

  const chartData = useMemo(() => {
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

    const result: ChartPoint[] = [];

    // ── Phase 1: Pre-IPO purchases from CONFIRMED_PURCHASES ──
    // Only needed for "All" or "1Y" ranges that extend before the IPO
    if (cutoffStr < STRC_IPO_DATE) {
      const preIpo = CONFIRMED_PURCHASES.filter(
        (p) => p.date >= cutoffStr && p.date < STRC_IPO_DATE,
      );
      for (const p of preIpo) {
        result.push({
          date: p.date,
          btc_confirmed: p.btc,
          btc_estimated: 0,
          btc_cumulative: p.cumulative,
          cost_m: p.cost_m,
          avg_cost: p.avg_cost,
        });
      }
    }

    // ── Phase 2: Post-IPO — EVERYTHING from flywheel_days ──
    // This is the SAME data source as Volume & ATM Tracker.
    // Confirmed days = volume-weighted 8-K allocations (daily granularity)
    // Estimated days = flywheel estimates (STRC + MSTR → BTC)
    const postIpoDays = flywheelDays.filter(
      (d) => d.date >= cutoffStr && d.btc_purchased > 0,
    );

    // Build cumulative starting from pre-IPO holdings
    let cumBtc = PRE_IPO_CUMULATIVE;

    // If range starts after IPO, we need the cumulative up to cutoff
    // Sum all flywheel days before the cutoff
    if (cutoffStr >= STRC_IPO_DATE) {
      const preCutoff = flywheelDays.filter(
        (d) => d.date < cutoffStr && d.btc_purchased > 0,
      );
      cumBtc += preCutoff.reduce((s, d) => s + d.btc_purchased, 0);
    }

    for (const day of postIpoDays) {
      cumBtc += day.btc_purchased;
      const proceedsM =
        day.strc_issuance_confirmed +
        day.strc_issuance_estimated +
        day.mstr_issuance_estimated;

      result.push({
        date: day.date,
        btc_confirmed: day.source === "confirmed" ? day.btc_purchased : 0,
        btc_estimated: day.source === "estimated" ? day.btc_purchased : 0,
        btc_cumulative: cumBtc,
        cost_m: proceedsM,
        avg_cost: day.btc_purchased > 0 ? (proceedsM * 1e6) / day.btc_purchased : btcPrice,
      });
    }

    // Sort by date
    result.sort((a, b) => a.date.localeCompare(b.date));

    return result;
  }, [range, btcPrice, flywheelDays]);

  const tickInterval = Math.max(1, Math.floor(chartData.length / 12));

  // Summary stats
  const totalBtcInRange = chartData.reduce((s, d) => s + d.btc_confirmed + d.btc_estimated, 0);
  const totalCostInRange = chartData.reduce((s, d) => s + d.cost_m, 0);
  const confirmedCount = chartData.filter((d) => d.btc_confirmed > 0).length;
  const estimatedCount = chartData.filter((d) => d.btc_estimated > 0).length;
  const latestCumulative = chartData.length > 0
    ? chartData[chartData.length - 1].btc_cumulative
    : LATEST_CONFIRMED_BTC;

  // Overall totals
  const totalCostAll = CONFIRMED_PURCHASES.reduce((s, p) => s + p.cost_m, 0);
  const avgCostBasis = totalCostAll > 0 ? (totalCostAll * 1e6) / LATEST_CONFIRMED_BTC : 0;

  // Flywheel KPIs
  const participationRate = volumeAtm?.kpi?.participation_rate_current ?? 0;
  const participationSource = volumeAtm?.kpi?.participation_rate_source ?? "unknown";

  if (snapLoading || volumeLoading) {
    return <div className="card"><div className="skeleton" style={{ height: 480 }} /></div>;
  }

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Strategy Bitcoin Purchases</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 2 }}>
            Source: 8-K filings + flywheel engine (same as Volume &amp; ATM Tracker)
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
            <YAxis
              yAxisId="daily"
              tick={{ fontSize: 9, fill: colors.btc, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`}
              width={40}
            />
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
                  case "btc_confirmed": return [`${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC`, "Purchased (8-K)"];
                  case "btc_estimated": return [`${v.toFixed(0)} BTC`, "Est. (Flywheel)"];
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
                  case "btc_estimated": return "Flywheel Est.";
                  case "btc_cumulative": return "Total Holdings";
                  default: return value;
                }
              }}
            />
            <Bar yAxisId="daily" dataKey="btc_confirmed" fill={colors.green} opacity={0.85} radius={[2, 2, 0, 0]} stackId="btc" />
            <Bar yAxisId="daily" dataKey="btc_estimated" fill={colors.amber} opacity={0.7} radius={[2, 2, 0, 0]} stackId="btc" />
            <Line yAxisId="cumulative" type="stepAfter" dataKey="btc_cumulative" stroke={colors.btc} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: colors.btc, fill: "#fff" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footnote */}
      <div style={{ fontSize: 10, color: "var(--t3)", lineHeight: 1.5, marginBottom: 16 }}>
        * Confirmed daily BTC purchases (green) are allocated from 8-K period totals using a volume-weighted
        average — each trading day receives a share of the period&apos;s total BTC proportional to its STRC trading
        volume relative to the period total. Estimated purchases (amber) are derived from the flywheel engine
        using actual daily STRC volume × participation rate for STRC proceeds, plus MSTR common equity issuance
        targeting 1.25× the cumulative dividend liability, subject to the mNAV governor.
      </div>

      {/* Purchase Events Table */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t2)" }}>
            Recent Purchase Events
          </span>
          <Badge variant="neutral">{CONFIRMED_PURCHASES.length} confirmed</Badge>
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

      {/* Methodology */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <button
          onClick={() => setShowMethodology(!showMethodology)}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: 0, fontSize: "var(--text-xs)", color: "var(--t3)", fontWeight: 500 }}
        >
          <span style={{ transform: showMethodology ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease", display: "inline-block" }}>▶</span>
          BTC Purchase Estimation Methodology
        </button>
        {showMethodology && (
          <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--t3)", lineHeight: 1.6 }}>
            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Unified data source</strong>: This chart and the Volume &amp; ATM Tracker
              use the exact same flywheel engine. STRC issuance estimates in the ATM tracker directly
              determine the BTC purchase estimates shown here. When a new 8-K is filed, both charts
              update simultaneously — estimated bars become confirmed bars.
            </p>
            <div className="mono" style={{ background: "var(--bg-raised)", padding: "10px 14px", borderRadius: "var(--r-sm)", marginBottom: 10, fontSize: "var(--text-xs)", lineHeight: 1.8 }}>
              <div>1. STRC volume × {(participationRate * 100).toFixed(1)}% participation → est. shares issued</div>
              <div>2. STRC proceeds = shares × price → 100% to BTC (per management)</div>
              <div>3. New STRC shares → grows cumulative dividend liability (11.25% × notional)</div>
              <div>4. MSTR targets 1.25× cumulative dividend liability (25% surplus → BTC)</div>
              <div>5. mNAV governor: issue if mNAV &gt; 1.0×, halt if below NAV</div>
              <div>6. Total BTC = (STRC proceeds + MSTR surplus) / BTC price</div>
              <div>   Rate source: {participationSource === "calibrated" ? "Volume backtested from 8-K filings" : "Management guidance (25%)"}</div>
            </div>
            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: "var(--t2)" }}>Confirmed days</strong> (<Badge variant="green">8-K</Badge>): The 8-K period total
              is allocated proportionally to daily STRC trading volume. Higher-volume days get more of the
              confirmed BTC.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--t2)" }}>Estimated days</strong> (<Badge variant="amber">Est.</Badge>): For days not yet
              covered by an 8-K, the flywheel applies the calibrated participation rate to actual daily volume.
              Strategy files 8-Ks weekly — estimates are typically outstanding for 5–10 trading days before
              being replaced by actuals.
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
