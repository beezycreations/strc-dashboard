"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { colors, rechartsDefaults, STRC_IPO_DATE } from "@/src/lib/chart-config";

interface PriceRateChartProps {
  data?: {
    prices?: Array<{ date: string; strc: number }>;
    rates?: Array<{ date: string; strc_rate_pct: number; sofr_1m_pct: number }>;
    dividends?: Array<{ periodSort: string; ratePct: number }>;
  };
}

export default function PriceRateChart({ data }: PriceRateChartProps) {
  // Filter out pre-IPO data
  const ipoFilteredPrices = data?.prices?.filter((p) => p.date >= STRC_IPO_DATE);

  if (!data || !ipoFilteredPrices?.length) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>Loading chart data...</div>;
  }

  // Build rate lookup from dividend schedule (DB-backed, authoritative)
  // Each dividend has periodSort "YYYY-MM" and ratePct
  // The new rate takes effect on the record date (15th of the month).
  // Before the 15th, the prior month's rate is still in effect.
  const dividendRateByMonth = new Map<string, number>();
  for (const d of (data.dividends ?? [])) {
    dividendRateByMonth.set(d.periodSort, d.ratePct);
  }

  function prevMonth(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  }

  // SOFR lookup from rates array (daily observations)
  const sofrMap = new Map<string, number>();
  for (const r of (data.rates ?? [])) {
    if (r.sofr_1m_pct) sofrMap.set(r.date, r.sofr_1m_pct);
  }

  // Forward-fill SOFR so every day has a value
  let lastSofr: number | null = null;

  const chartData = ipoFilteredPrices.map((p) => {
    const month = p.date.slice(0, 7); // "YYYY-MM"
    const day = parseInt(p.date.slice(8, 10));

    // Before the 15th (record date), the prior month's rate is in effect
    const effectiveMonth = day < 15 ? prevMonth(month) : month;
    const ratePct = dividendRateByMonth.get(effectiveMonth)
      ?? dividendRateByMonth.get(prevMonth(effectiveMonth))
      ?? null;

    // Forward-fill SOFR
    const sofrVal = sofrMap.get(p.date);
    if (sofrVal != null) lastSofr = sofrVal;

    return {
      date: p.date,
      strc: p.strc,
      rate_pct: ratePct,
      sofr_pct: lastSofr,
    };
  });

  // Check for dividend dates (last day of month)
  const isDividendDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.getMonth() !== d.getMonth();
  };

  // Show ~12 evenly spaced tick labels to avoid crowding
  const tickInterval = Math.max(1, Math.floor(chartData.length / 12));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 5, right: 50, bottom: 5, left: 5 }}>
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
        <Legend
          verticalAlign="top"
          align="right"
          wrapperStyle={{ fontSize: 11, fontFamily: rechartsDefaults.fontFamily, paddingBottom: 8 }}
          formatter={(value: string) => {
            if (value === "strc") return "STRC Price";
            if (value === "rate_pct") return "STRC Rate";
            if (value === "sofr_pct") return "SOFR 1M";
            return value;
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
        {/* STRC Rate line (was Bar) */}
        <Line yAxisId="rate" type="stepAfter" dataKey="rate_pct" stroke={colors.violet} strokeWidth={2} dot={false} />
        {/* SOFR line */}
        <Line yAxisId="rate" type="stepAfter" dataKey="sofr_pct" stroke={colors.accent} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
