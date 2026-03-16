"use client";

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
  ReferenceLine,
  Cell,
} from "recharts";
import { colors, rechartsDefaults, STRC_IPO_DATE } from "@/src/lib/chart-config";

interface PriceRateChartProps {
  data?: {
    prices?: Array<{ date: string; strc: number }>;
    rates?: Array<{ date: string; strc_rate_pct: number; sofr_1m_pct: number }>;
    dividends?: Array<{ periodSort: string; ratePct: number; payoutDate: string; dividendPerShare: number }>;
  };
}

export default function PriceRateChart({ data }: PriceRateChartProps) {
  // Filter out pre-IPO data
  const ipoFilteredPrices = data?.prices?.filter((p) => p.date >= STRC_IPO_DATE);

  if (!data || !ipoFilteredPrices?.length) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t3)", fontSize: "var(--text-sm)" }}>Loading chart data...</div>;
  }

  // Build rate lookup from dividend schedule (DB-backed, authoritative)
  const dividendRateByMonth = new Map<string, number>();
  for (const d of (data.dividends ?? [])) {
    dividendRateByMonth.set(d.periodSort, d.ratePct);
  }

  // Build payout date set for dividend markers
  // payoutDate format is "MM/DD/YYYY" — convert to "YYYY-MM-DD"
  const payoutDates = new Map<string, number>();
  for (const d of (data.dividends ?? [])) {
    if (d.payoutDate) {
      const [mm, dd, yyyy] = d.payoutDate.split("/");
      if (mm && dd && yyyy) {
        const isoDate = `${yyyy}-${mm}-${dd}`;
        payoutDates.set(isoDate, d.dividendPerShare ?? 0);
      }
    }
  }

  function prevMonth(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  }

  const chartData = ipoFilteredPrices.map((p) => {
    const month = p.date.slice(0, 7);
    const day = parseInt(p.date.slice(8, 10));
    const effectiveMonth = day < 15 ? prevMonth(month) : month;
    const ratePct = dividendRateByMonth.get(effectiveMonth)
      ?? dividendRateByMonth.get(prevMonth(effectiveMonth))
      ?? null;

    // Check if this date is a dividend payout
    const isDivPayout = payoutDates.has(p.date);

    return {
      date: p.date,
      strc: p.strc,
      rate_pct: ratePct,
      div_marker: isDivPayout ? 1 : 0,
    };
  });

  // Show ~12 evenly spaced tick labels
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
            if (name === "div_marker") return v > 0 ? ["Paid", "Dividend"] : [null, null];
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
            if (value === "div_marker") return "Dividend Paid";
            return value;
          }}
        />
        {/* Par reference line */}
        <ReferenceLine yAxisId="price" y={100} stroke={colors.t3} strokeDasharray="4 4" />
        {/* Dividend payment bars — full-height green columns on payout dates */}
        <Bar yAxisId="rate" dataKey="div_marker" barSize={2} isAnimationActive={false} legendType="diamond">
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.div_marker > 0 ? colors.green : "transparent"} fillOpacity={d.div_marker > 0 ? 0.5 : 0} />
          ))}
        </Bar>
        {/* STRC Price line */}
        <Line yAxisId="price" type="monotone" dataKey="strc" stroke={colors.accent} strokeWidth={2} dot={false} />
        {/* STRC Rate line */}
        <Line yAxisId="rate" type="stepAfter" dataKey="rate_pct" stroke={colors.violet} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
