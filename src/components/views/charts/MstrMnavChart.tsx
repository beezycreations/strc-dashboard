"use client";

import { useState, useMemo } from "react";
import { useMstrMnav } from "@/src/lib/hooks/use-api";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

interface DataPoint {
  date: string;
  mnav: number;
  mstr_price: number;
  btc_price: number;
  cum_btc: number;
  ev_b: number;
  btc_reserve_b: number;
}

export default function MstrMnavChart() {
  const { data, isLoading } = useMstrMnav();
  const [range, setRange] = useState<"1y" | "3y" | "all">("all");

  const chartData = useMemo(() => {
    if (!data?.data) return [];
    const points = data.data as DataPoint[];

    const now = new Date();
    const cutoff =
      range === "1y"
        ? new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        : range === "3y"
          ? new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
          : new Date("2020-08-01");
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return points.filter((p) => p.date >= cutoffStr);
  }, [data, range]);

  const tickInterval = Math.max(1, Math.floor(chartData.length / 12));

  // Stats for the visible range
  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    const mnavValues = chartData.map((d) => d.mnav);
    const current = mnavValues[mnavValues.length - 1];
    const min = Math.min(...mnavValues);
    const max = Math.max(...mnavValues);
    const avg = mnavValues.reduce((s, v) => s + v, 0) / mnavValues.length;
    const latest = chartData[chartData.length - 1];
    return { current, min, max, avg, latest };
  }, [chartData]);

  if (isLoading || !data) {
    return <div className="skeleton" style={{ height: 380 }} />;
  }

  if (chartData.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--t3)", fontSize: "var(--text-sm)" }}>
        No mNAV data available
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>MSTR Historical mNAV</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 2 }}>
            Enterprise Value / BTC Reserve — since first BTC purchase
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["1y", "3y", "all"] as const).map((r) => (
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

      {/* Stats strip */}
      {stats && (
        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: "var(--text-xs)", flexWrap: "wrap" }}>
          <StatChip label="Current" value={`${stats.current.toFixed(2)}×`} color="var(--amber)" />
          <StatChip label="Avg" value={`${stats.avg.toFixed(2)}×`} />
          <StatChip label="Min" value={`${stats.min.toFixed(2)}×`} color="var(--green)" />
          <StatChip label="Max" value={`${stats.max.toFixed(2)}×`} color="var(--red)" />
          <StatChip label="BTC Held" value={`${(stats.latest.cum_btc / 1000).toFixed(0)}K`} color="var(--btc)" />
          <StatChip label="EV" value={`$${stats.latest.ev_b.toFixed(0)}B`} />
          <StatChip label="BTC Reserve" value={`$${stats.latest.btc_reserve_b.toFixed(0)}B`} />
        </div>
      )}

      {/* Chart */}
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: string) => {
                const d = new Date(v + "T00:00:00");
                return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
              }}
              interval={tickInterval}
            />
            {/* Left Y-axis: mNAV */}
            <YAxis
              yAxisId="mnav"
              tick={{ fontSize: 10, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
              tickFormatter={(v: number) => `${v.toFixed(1)}×`}
              width={40}
            />
            {/* Right Y-axis: Cumulative BTC (in K) */}
            <YAxis
              yAxisId="btc"
              orientation="right"
              tick={{ fontSize: 9, fill: colors.btc, fontFamily: rechartsDefaults.fontFamily }}
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
                switch (String(name)) {
                  case "mnav": return [`${v.toFixed(3)}×`, "mNAV (EV / BTC Reserve)"];
                  case "cum_btc": return [`${v.toLocaleString()} BTC`, "Cumulative Holdings"];
                  default: return [`${v}`, String(name)];
                }
              }}
              // Custom content to also show EV, BTC Reserve, prices
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as DataPoint | undefined;
                if (!d) return null;
                const dateStr = new Date(String(label) + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric", year: "numeric",
                });
                return (
                  <div style={{
                    ...rechartsDefaults.tooltipStyle,
                    padding: "8px 12px",
                    fontSize: "var(--text-xs)",
                    lineHeight: 1.6,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{dateStr}</div>
                    <div>
                      <span style={{ color: colors.amber, fontWeight: 600 }}>mNAV: {d.mnav.toFixed(3)}×</span>
                    </div>
                    <div style={{ color: colors.btc }}>
                      BTC Holdings: {d.cum_btc.toLocaleString()}
                    </div>
                    <div style={{ color: "var(--t2)" }}>
                      EV: ${d.ev_b.toFixed(1)}B · BTC Reserve: ${d.btc_reserve_b.toFixed(1)}B
                    </div>
                    <div style={{ color: "var(--t3)" }}>
                      MSTR: ${d.mstr_price.toLocaleString(undefined, { maximumFractionDigits: 2 })} · BTC: ${d.btc_price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                );
              }}
            />
            {/* 1.0× reference line */}
            <ReferenceLine yAxisId="mnav" y={1} stroke={colors.t3} strokeDasharray="6 3" label={{ value: "1.0× NAV", fill: colors.t3, fontSize: 9 }} />
            {/* mNAV area + line */}
            <Area
              yAxisId="mnav"
              type="monotone"
              dataKey="mnav"
              fill={colors.amber}
              fillOpacity={0.08}
              stroke="none"
            />
            <Line
              yAxisId="mnav"
              type="monotone"
              dataKey="mnav"
              stroke={colors.amber}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: colors.amber, fill: "#fff" }}
            />
            {/* Cumulative BTC holdings line */}
            <Line
              yAxisId="btc"
              type="stepAfter"
              dataKey="cum_btc"
              stroke={colors.btc}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3, stroke: colors.btc, fill: "#fff" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend + source */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, fontSize: "var(--text-xs)", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ color: colors.amber }}>mNAV (EV / BTC Reserve)</span>
          <span style={{ color: colors.btc }}>BTC Holdings</span>
        </div>
        <span style={{ color: "var(--t3)" }}>
          {data.source === "fmp" ? "FMP historical prices" : "Estimated from purchase data"} · {chartData.length} pts
        </span>
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ color: "var(--t3)" }}>{label} </span>
      <span className="mono" style={{ fontWeight: 600, color }}>{value}</span>
    </div>
  );
}
