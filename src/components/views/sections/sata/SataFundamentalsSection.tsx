"use client";

import { SATA_CONFIRMED_PURCHASES, TOTAL_SATA_BTC_COST } from "@/src/lib/data/sata-confirmed-purchases";
import { STRC_TREASURY_POSITION, TAX_BRACKETS, SATA_RATE_PCT } from "@/src/lib/data/sata-capital-structure";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { colors, rechartsDefaults } from "@/src/lib/chart-config";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  snap: any;
}

export default function SataFundamentalsSection({ snap }: Props) {
  const s = snap;

  // BTC accumulation chart data
  const purchaseData = SATA_CONFIRMED_PURCHASES.map((p) => ({
    date: p.date,
    btc: p.btc,
    cumulative: p.cumulative,
    avg_cost: p.avg_cost,
  }));

  // Average cost basis
  const totalBtc = SATA_CONFIRMED_PURCHASES[SATA_CONFIRMED_PURCHASES.length - 1].cumulative;
  const avgCost = totalBtc > 0 ? Math.round((TOTAL_SATA_BTC_COST * 1e6) / totalBtc) : 0;

  // STRC reserve live valuation
  const strcReserveValue = s.strc_price != null
    ? (STRC_TREASURY_POSITION / 100) * s.strc_price // shares × price
    : STRC_TREASURY_POSITION;

  return (
    <section id="sata-fundamentals" className="section-anchor">
      <div className="section-header">Fundamentals</div>

      {/* Key metrics row */}
      <div className="metric-grid" style={{ marginBottom: 20 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Total BTC Held</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--btc)" }}>
            {totalBtc.toLocaleString()} BTC
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>
            As of {s.btc_holdings_date ?? "—"}
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Avg Cost Basis</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>
            ${avgCost.toLocaleString()}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>
            Total invested: ${TOTAL_SATA_BTC_COST.toLocaleString()}M
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>Unrealized P&L</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: s.btc_price > avgCost ? "var(--green)" : "var(--red)" }}>
            {s.btc_price != null ? `$${((totalBtc * s.btc_price - TOTAL_SATA_BTC_COST * 1e6) / 1e6).toFixed(0)}M` : "—"}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>
            {s.btc_price != null && avgCost > 0 ? `${((s.btc_price / avgCost - 1) * 100).toFixed(1)}% return` : "—"}
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>STRC Treasury Position</div>
          <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--accent)" }}>
            ${(strcReserveValue / 1e6).toFixed(1)}M
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>
            Cross-holding for dividend reserve
          </div>
        </div>
      </div>

      {/* BTC Accumulation Chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Strive BTC Accumulation</div>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={purchaseData} margin={{ top: 5, right: 50, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={rechartsDefaults.gridStroke} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.t3 }} tickFormatter={(v: string) => v.slice(2, 7)} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: colors.t3 }} label={{ value: "BTC Purchased", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: colors.t3 } }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: colors.accent }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} label={{ value: "Cumulative BTC", angle: 90, position: "insideRight", style: { fontSize: 10, fill: colors.accent } }} />
              <Tooltip
                contentStyle={rechartsDefaults.tooltipStyle}
                formatter={(v: unknown, name: unknown) => {
                  const val = Number(v);
                  switch (String(name)) {
                    case "Purchased": return [`${val.toLocaleString()} BTC`, "Purchased"];
                    case "Cumulative": return [`${val.toLocaleString()} BTC`, "Cumulative"];
                    default: return [val, String(name)];
                  }
                }}
              />
              <Legend
                verticalAlign="top" align="right"
                wrapperStyle={{ fontSize: 11, fontFamily: rechartsDefaults.fontFamily, paddingBottom: 8 }}
              />
              <Bar yAxisId="left" dataKey="btc" name="Purchased" fill={colors.btc} radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative" stroke={colors.accent} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tax-Equivalent Yield Table */}
      <div className="card">
        <div style={{ fontSize: "var(--text-md)", fontWeight: 600, marginBottom: 12 }}>Tax-Equivalent Yield (ROC Treatment)</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 12 }}>
          SATA dividends are classified as Return of Capital, deferring tax until cost basis is depleted. This provides significant tax advantage at higher marginal rates.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              {["Marginal Tax Rate", "Nominal Yield", "Tax-Equiv. Yield", "Advantage"].map((h) => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--t3)", fontWeight: 500, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TAX_BRACKETS.map((row) => (
              <tr key={row.bracket} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{row.bracket}</td>
                <td className="mono" style={{ padding: "8px 12px" }}>{SATA_RATE_PCT.toFixed(2)}%</td>
                <td className="mono" style={{ padding: "8px 12px", fontWeight: 600, color: "var(--green)" }}>{row.taxEquivYield.toFixed(2)}%</td>
                <td className="mono" style={{ padding: "8px 12px", color: "var(--accent)" }}>+{(row.taxEquivYield - SATA_RATE_PCT).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
