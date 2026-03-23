import AsOf from "./AsOf";

export default function LiveCard({ label, value, sub, ts }: { label: string; value: string | null; sub: string; ts?: string }) {
  return (
    <div className="card" style={{ minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        {value != null && <AsOf ts={ts} />}
      </div>
      <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: value != null ? "var(--t1)" : "var(--t3)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value ?? "N/A"}
      </div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
    </div>
  );
}
