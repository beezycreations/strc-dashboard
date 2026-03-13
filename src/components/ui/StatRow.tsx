"use client";

interface StatCell {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}

interface StatRowProps {
  cells: StatCell[];
}

export default function StatRow({ cells }: StatRowProps) {
  return (
    <div style={{ display: "flex", gap: "var(--card-gap)", flexWrap: "wrap" }}>
      {cells.map((cell, i) => (
        <div key={i} style={{ flex: "1 1 0", minWidth: 100 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginBottom: 2 }}>{cell.label}</div>
          <div className={cell.mono !== false ? "mono" : ""} style={{ fontSize: "var(--text-md)", fontWeight: 600, color: cell.color || "var(--t1)" }}>{cell.value}</div>
        </div>
      ))}
    </div>
  );
}
