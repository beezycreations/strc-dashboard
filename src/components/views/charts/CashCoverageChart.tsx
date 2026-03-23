"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

interface DataPoint {
  date: string;
  usd_reserve_months: number;
}

interface Props {
  data: DataPoint[];
}

export default function CashCoverageChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>
        Cash coverage data loading...
      </div>
    );
  }

  // Sample weekly (every ~5 trading days) to reduce noise
  const weekly = data.filter((_, i) => i % 5 === 0 || i === data.length - 1);

  const values = weekly.map((d) => d.usd_reserve_months);
  const yMin = Math.max(0, Math.floor(Math.min(...values) - 2));
  const yMax = Math.ceil(Math.max(...values) + 2);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={weekly} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: colors.t3 }}
          tickFormatter={(v: string) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 10, fill: colors.t3 }}
          tickFormatter={(v: number) => `${v.toFixed(0)}mo`}
        />
        <Tooltip
          contentStyle={rechartsDefaults.tooltipStyle}
          formatter={(v: unknown) => [`${Number(v).toFixed(1)} months`, "Cash Reserve Coverage"]}
          labelFormatter={(label: unknown) => String(label)}
        />
        {/* Threshold reference lines */}
        <ReferenceLine y={24} stroke={colors.green} strokeDasharray="4 4" label={{ value: "24mo Safe", fill: colors.green, fontSize: 10, position: "right" }} />
        <ReferenceLine y={12} stroke={colors.amber} strokeDasharray="4 4" label={{ value: "12mo Watch", fill: colors.amber, fontSize: 10, position: "right" }} />
        <ReferenceLine y={6} stroke={colors.red} strokeDasharray="4 4" label={{ value: "6mo Alert", fill: colors.red, fontSize: 10, position: "right" }} />
        <Line
          type="monotone"
          dataKey="usd_reserve_months"
          stroke={colors.accent}
          strokeWidth={2}
          dot={false}
          name="Cash Coverage"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
