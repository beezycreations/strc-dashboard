"use client";

interface ProgressBarProps {
  label: string;
  value: string;
  pct: number;
  color: string;
  subtext?: string;
}

export default function ProgressBar({ label, value, pct, color, subtext }: ProgressBarProps) {
  const clampedPct = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--t2)" }}>{label}</span>
        <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--t1)", fontWeight: 500 }}>{value}</span>
      </div>
      <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${clampedPct}%`, background: color, borderRadius: 3, transition: "width 0.3s ease" }} />
      </div>
      {subtext && <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 2 }}>{subtext}</div>}
    </div>
  );
}
