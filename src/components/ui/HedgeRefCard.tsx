export default function HedgeRefCard({ title, betaLabel, betaValue, source }: { title: string; betaLabel: string; betaValue: number | null; source: string }) {
  if (betaValue == null) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ color: "var(--t3)", fontSize: "var(--text-sm)" }}>
          Beta data unavailable — requires price history
        </div>
      </div>
    );
  }
  const ratio = (betaValue * 100).toFixed(0);
  const notional = Math.round(betaValue * 1_000_000);
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "var(--text-xs)" }}>
        <div>
          <div style={{ color: "var(--t3)" }}>{betaLabel}</div>
          <div className="mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{betaValue.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ color: "var(--t3)" }}>Hedge Ratio</div>
          <div className="mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{ratio}% of position</div>
        </div>
        <div>
          <div style={{ color: "var(--t3)" }}>Notional (@$1M)</div>
          <div className="mono" style={{ fontWeight: 600 }}>${notional.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ color: "var(--t3)" }}>Source</div>
          <div style={{ color: "var(--t2)" }}>{source}</div>
        </div>
      </div>
    </div>
  );
}
