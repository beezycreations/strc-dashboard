"use client";

interface RiskScoreComponents {
  btc: number;
  yield: number;
  strike: number;
  iv: number;
  days: number;
}

interface RiskScoreGaugeProps {
  composite: number;
  components: RiskScoreComponents;
}

const weights = { btc: 0.30, yield: 0.25, strike: 0.20, iv: 0.15, days: 0.10 };
const labels: Record<keyof RiskScoreComponents, string> = {
  btc: "BTC Coverage", yield: "Yield Spread", strike: "Strike OTM %", iv: "IV Percentile", days: "Days to Ann.",
};

function scoreColor(n: number): string {
  if (n >= 7) return "var(--green)";
  if (n >= 4) return "var(--amber)";
  return "var(--red)";
}

function scoreBg(n: number): string {
  if (n >= 7) return "var(--green-l)";
  if (n >= 4) return "var(--amber-l)";
  return "var(--red-l)";
}

export default function RiskScoreGauge({ composite, components }: RiskScoreGaugeProps) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--t2)", fontWeight: 600, marginBottom: 8 }}>COMPOSITE RISK SCORE</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span className="mono" style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: scoreColor(composite) }}>{composite.toFixed(1)}</span>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--t3)" }}>/ 10</span>
        <div style={{ flex: 1, height: 12, background: "var(--surface-2)", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${composite * 10}%`, background: scoreColor(composite), borderRadius: 6 }} />
        </div>
        <span className="badge" style={{ background: scoreBg(composite), color: scoreColor(composite) }}>
          {composite >= 7 ? "SAFE" : composite >= 4 ? "WATCH" : "ALERT"}
        </span>
      </div>
      {(Object.keys(labels) as Array<keyof RiskScoreComponents>).map((key) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ width: 90, fontSize: "var(--text-xs)", color: "var(--t2)" }}>{labels[key]}</span>
          <span className="mono" style={{ width: 28, fontSize: "var(--text-sm)", fontWeight: 600, color: scoreColor(components[key]) }}>{components[key].toFixed(1)}</span>
          <div style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${components[key] * 10}%`, background: scoreColor(components[key]), borderRadius: 3 }} />
          </div>
          <span style={{ width: 30, fontSize: "var(--text-xs)", color: "var(--t3)", textAlign: "right" }}>({(weights[key] * 100).toFixed(0)}%)</span>
        </div>
      ))}
    </div>
  );
}
