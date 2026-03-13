"use client";

interface TrancheSensitivityTableProps {
  configs: Array<{ name: string; seniorPct: number; juniorPct: number }>;
  seniorTargetRate: number;
  rateScenarios: number[];
}

export default function TrancheSensitivityTable({ configs, seniorTargetRate, rateScenarios }: TrancheSensitivityTableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--t3)", fontWeight: 500 }}>STRC Rate</th>
            {configs.map((c) => (
              <th key={c.name} style={{ textAlign: "center", padding: "6px 8px", color: "var(--t2)", fontWeight: 600 }}>Config {c.name} Jr Yield</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rateScenarios.map((rate) => (
            <tr key={rate} style={{ borderTop: "1px solid var(--border)" }}>
              <td className="mono" style={{ padding: "6px 8px", fontWeight: 500 }}>{rate.toFixed(2)}%</td>
              {configs.map((c) => {
                const seniorCost = seniorTargetRate * c.seniorPct;
                const excess = rate - seniorCost;
                const juniorYield = excess / c.juniorPct;
                const isNegative = juniorYield < 0;
                return (
                  <td key={c.name} className="mono" style={{
                    textAlign: "center", padding: "6px 8px",
                    color: isNegative ? "var(--red)" : "var(--t1)",
                    fontWeight: 600,
                  }}>
                    {juniorYield.toFixed(2)}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
