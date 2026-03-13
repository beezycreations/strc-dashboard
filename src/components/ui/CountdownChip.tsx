"use client";

interface CountdownChipProps {
  daysUntil: number;
  date: string;
  label: string;
}

export default function CountdownChip({ daysUntil, date, label }: CountdownChipProps) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--surface)", borderRadius: "var(--r-xs)", fontSize: "var(--text-sm)" }}>
      <span className="mono" style={{ fontWeight: 600, color: daysUntil <= 5 ? "var(--amber)" : "var(--t1)" }}>{daysUntil}d</span>
      <span style={{ color: "var(--t3)" }}>{label}</span>
      <span style={{ color: "var(--t3)", fontSize: "var(--text-xs)" }}>{date}</span>
    </div>
  );
}
