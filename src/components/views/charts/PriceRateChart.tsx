"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

interface PriceRateChartProps {
  data?: {
    prices?: Array<{ date: string; strc: number }>;
    rates?: Array<{ date: string; strc_rate_pct: number; sofr_1m_pct: number }>;
  };
}

export default function PriceRateChart({ data }: PriceRateChartProps) {
  if (!data?.prices?.length) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>Loading chart data...</div>;
  }

  // Merge prices and rates by date
  const rateMap = new Map(
    (data.rates ?? []).map((r) => [r.date, r])
  );

  const chartData = data.prices.map((p) => {
    const rate = rateMap.get(p.date);
    return {
      date: p.date,
      strc: p.strc,
      rate_pct: rate?.strc_rate_pct ?? null,
      sofr_pct: rate?.sofr_1m_pct ?? null,
    };
  });

  // Check for dividend dates (last day of month)
  const isDividendDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.getMonth() !== d.getMonth();
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 5, right: 50, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
          tickFormatter={(v: string) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="price"
          domain={[96, 106]}
          tick={{ fontSize: 10, fill: colors.t3, fontFamily: rechartsDefaults.fontFamily }}
          tickFormatter={(v: number) => `$${v}`}
        />
        <YAxis
          yAxisId="rate"
          orientation="right"
          domain={[0, 14]}
          tick={{ fontSize: 10, fill: colors.violet, fontFamily: rechartsDefaults.fontFamily }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={rechartsDefaults.tooltipStyle}
          formatter={(value: unknown, name: unknown) => {
            const v = Number(value);
            if (name === "strc") return [`$${v.toFixed(2)}`, "STRC Price"];
            if (name === "rate_pct") return [`${v.toFixed(2)}%`, "STRC Rate"];
            if (name === "sofr_pct") return [`${v.toFixed(2)}%`, "SOFR 1M"];
            return [`${v}`, String(name)];
          }}
        />
        {/* Par reference line */}
        <ReferenceLine yAxisId="price" y={100} stroke={colors.t3} strokeDasharray="4 4" />
        {/* Dividend date markers */}
        {chartData
          .filter((d) => isDividendDate(d.date))
          .map((d) => (
            <ReferenceLine key={d.date} yAxisId="price" x={d.date} stroke={colors.green} strokeDasharray="3 3" strokeWidth={1} />
          ))}
        {/* STRC Price line */}
        <Line yAxisId="price" type="monotone" dataKey="strc" stroke={colors.accent} strokeWidth={2} dot={false} />
        {/* Rate bars */}
        <Bar yAxisId="rate" dataKey="rate_pct" fill={colors.violet} opacity={0.6} barSize={4} />
        {/* SOFR line */}
        <Line yAxisId="rate" type="stepAfter" dataKey="sofr_pct" stroke={colors.accent} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
