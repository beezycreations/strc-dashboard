import AsOf from "./AsOf";

export default function MetricCard({ label, value, color, ts }: { label: string; value: string | null; color: string; ts?: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>{label}</div>
        {value != null && <AsOf ts={ts} />}
      </div>
      <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: value != null ? color : "var(--t3)" }}>
        {value ?? "N/A"}
      </div>
    </div>
  );
}
