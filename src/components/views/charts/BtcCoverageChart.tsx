"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

interface DataPoint {
  date: string;
  btc_coverage_ratio: number;
}

interface Props {
  data: DataPoint[];
}

export default function BtcCoverageChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>
        Coverage ratio data loading...
      </div>
    );
  }

  const values = data.map((d) => d.btc_coverage_ratio);
  const yMin = Math.max(0, Math.floor(Math.min(...values) - 0.5));
  const yMax = Math.ceil(Math.max(...values) + 0.5);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
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
          tickFormatter={(v: number) => `${v.toFixed(1)}×`}
        />
        <Tooltip
          contentStyle={rechartsDefaults.tooltipStyle}
          formatter={(v: unknown) => [`${Number(v).toFixed(2)}×`, "Coverage Ratio"]}
          labelFormatter={(label: unknown) => String(label)}
        />
        {/* Threshold reference lines */}
        <ReferenceLine y={3} stroke={colors.green} strokeDasharray="4 4" label={{ value: "3× Safe", fill: colors.green, fontSize: 10, position: "right" }} />
        <ReferenceLine y={2} stroke={colors.amber} strokeDasharray="4 4" label={{ value: "2× Watch", fill: colors.amber, fontSize: 10, position: "right" }} />
        <ReferenceLine y={1} stroke={colors.red} strokeDasharray="4 4" label={{ value: "1× Alert", fill: colors.red, fontSize: 10, position: "right" }} />
        <Line
          type="monotone"
          dataKey="btc_coverage_ratio"
          stroke={colors.btc}
          strokeWidth={2}
          dot={false}
          name="BTC Coverage"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
