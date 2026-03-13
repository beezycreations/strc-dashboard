"use client";

interface CoverageMatrixProps {
  strcRate: number;
  seniorTargetRate: number;
  configs: Array<{ name: string; seniorPct: number; juniorPct: number }>;
}

function testStatus(value: number, pass: number, watch: number): "pass" | "watch" | "fail" {
  if (value >= pass) return "pass";
  if (value >= watch) return "watch";
  return "fail";
}

const statusColors = {
  pass: { bg: "var(--green-l)", color: "var(--green)" },
  watch: { bg: "var(--amber-l)", color: "var(--amber)" },
  fail: { bg: "var(--red-l)", color: "var(--red)" },
};

export default function CoverageMatrix({ strcRate, seniorTargetRate, configs }: CoverageMatrixProps) {
  const tests = configs.map((c) => {
    const scr = strcRate / (seniorTargetRate * c.seniorPct);
    const est = strcRate - seniorTargetRate * c.seniorPct;
    const rfb = est;
    return {
      name: c.name,
      scr: { value: scr, status: testStatus(scr, 1.25, 1.0) },
      est: { value: est, status: testStatus(est, 2.0, 0) },
      rfb: { value: rfb, status: testStatus(rfb, 3.0, 1.5) },
    };
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--t3)", fontWeight: 500 }}>Test</th>
            {tests.map((t) => (
              <th key={t.name} style={{ textAlign: "center", padding: "6px 8px", color: "var(--t2)", fontWeight: 600 }}>Config {t.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["scr", "est", "rfb"] as const).map((key) => (
            <tr key={key}>
              <td style={{ padding: "6px 8px", color: "var(--t2)", fontWeight: 500 }}>{key.toUpperCase()}</td>
              {tests.map((t) => {
                const cell = t[key];
                const s = statusColors[cell.status];
                return (
                  <td key={t.name} style={{ textAlign: "center", padding: "6px 8px" }}>
                    <span className="mono" style={{ display: "inline-block", padding: "2px 8px", borderRadius: "var(--r-xs)", background: s.bg, color: s.color, fontWeight: 600, fontSize: "var(--text-sm)" }}>
                      {key === "scr" ? `${cell.value.toFixed(2)}×` : `${cell.value.toFixed(2)}%`}
                    </span>
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
