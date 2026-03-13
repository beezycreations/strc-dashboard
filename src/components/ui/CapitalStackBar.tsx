"use client";

interface StackSegment {
  label: string;
  notional: number;
  color: string;
  rate: string;
  rank: number;
}

interface CapitalStackBarProps {
  segments: StackSegment[];
  btcNav: number;
  highlightTicker?: string;
}

export default function CapitalStackBar({ segments, btcNav, highlightTicker }: CapitalStackBarProps) {
  const maxVal = Math.max(...segments.map(s => s.notional), btcNav) * 1.1;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 200, paddingBottom: 28 }}>
        {segments.map((seg) => {
          const heightPct = (seg.notional / maxVal) * 100;
          const isHighlighted = highlightTicker && seg.label.includes(highlightTicker);
          return (
            <div key={seg.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>
                ${(seg.notional / 1e9).toFixed(1)}B
              </div>
              <div style={{
                width: "100%", maxWidth: 48, height: `${heightPct}%`, minHeight: 4,
                background: seg.color, borderRadius: "4px 4px 0 0",
                opacity: isHighlighted ? 1 : 0.75,
                border: isHighlighted ? "2px solid var(--t1)" : "none",
                transition: "height 0.3s ease",
              }} />
              <div style={{ fontSize: "var(--text-xs)", color: "var(--t2)", textAlign: "center", lineHeight: 1.2 }}>
                {seg.label}
                <br />
                <span className="mono" style={{ color: "var(--t3)" }}>{seg.rate}</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* BTC NAV reference line */}
      <div style={{
        position: "absolute",
        left: 0, right: 0,
        bottom: `${28 + (btcNav / maxVal) * 200 * 0.01 * 100}%`,
        borderTop: "2px dashed var(--btc)",
        pointerEvents: "none",
      }}>
        <span className="mono" style={{ position: "absolute", right: 0, top: -16, fontSize: "var(--text-xs)", color: "var(--btc-d)" }}>
          BTC NAV ${(btcNav / 1e9).toFixed(1)}B
        </span>
      </div>
    </div>
  );
}
