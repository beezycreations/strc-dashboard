"use client";

import { useState } from "react";

interface StackSegment {
  label: string;
  notional: number;
  color: string;
  rate: string;
  rank: number;
  description?: string;
}

interface CapitalStackBarProps {
  segments: StackSegment[];
  btcNav: number;
  highlightTicker?: string;
}

const DESCRIPTIONS: Record<string, string> = {
  Converts: "Senior unsecured convertible notes. Lowest coupon (~0.6%), convertible to MSTR common equity. Most senior in the capital stack.",
  STRF: "Strike Preferred Stock. Fixed 10% perpetual dividend. Senior to STRC/STRK/STRD. No BTC-linked upside.",
  STRC: "Variable-rate perpetual preferred. Rate resets monthly (SOFR floor). Ranks junior to Converts and STRF. Dynamic liquidation preference when ATM is active.",
  STRK: "8% perpetual preferred with conversion feature into MSTR common at a fixed strike. Junior to STRC.",
  STRD: "10% perpetual preferred. Most junior tranche. Highest fixed coupon compensates for subordination risk.",
};

export default function CapitalStackBar({ segments, btcNav, highlightTicker }: CapitalStackBarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Sort by rank (most senior first)
  const sorted = [...segments].sort((a, b) => a.rank - b.rank);
  const totalNotional = sorted.reduce((sum, s) => sum + s.notional, 0);

  return (
    <div>
      {/* Stacked horizontal bar */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <div style={{ display: "flex", borderRadius: "var(--r-sm)", overflow: "hidden", height: 44 }}>
          {sorted.map((seg, i) => {
            const widthPct = (seg.notional / totalNotional) * 100;
            const isHighlighted = highlightTicker && seg.label.includes(highlightTicker);
            const isHovered = hoveredIndex === i;
            return (
              <div
                key={seg.label}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  width: `${widthPct}%`,
                  background: seg.color,
                  opacity: hoveredIndex !== null ? (isHovered ? 1 : 0.5) : (isHighlighted ? 1 : 0.75),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  borderRight: "1px solid var(--bg)",
                  transition: "opacity 0.15s ease, transform 0.15s ease",
                  cursor: "pointer",
                  transform: isHovered ? "scaleY(1.08)" : "scaleY(1)",
                  transformOrigin: "bottom",
                }}
              >
                {widthPct > 8 && (
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
                    {seg.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Hover tooltip */}
        {hoveredIndex !== null && (() => {
          const seg = sorted[hoveredIndex];
          // Calculate position: center of the hovered segment
          let leftPct = 0;
          for (let i = 0; i < hoveredIndex; i++) {
            leftPct += (sorted[i].notional / totalNotional) * 100;
          }
          leftPct += ((seg.notional / totalNotional) * 100) / 2;
          // Clamp so tooltip doesn't overflow
          const clampedLeft = Math.max(20, Math.min(80, leftPct));

          return (
            <div style={{
              position: "absolute",
              top: 52,
              left: `${clampedLeft}%`,
              transform: "translateX(-50%)",
              background: "var(--t1)",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: "var(--r-sm)",
              fontSize: "var(--text-sm)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              zIndex: 10,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{seg.label}</div>
              <div className="mono" style={{ display: "flex", gap: 16 }}>
                <span>${(seg.notional / 1e9).toFixed(2)}B</span>
                <span>{seg.rate}</span>
                <span>{((seg.notional / totalNotional) * 100).toFixed(1)}% of stack</span>
              </div>
            </div>
          );
        })()}

        {/* BTC NAV marker removed — was overflowing card */}
      </div>

      {/* Seniority arrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: "var(--text-xs)", color: "var(--t3)" }}>
        <span style={{ fontWeight: 600 }}>Most Senior</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span style={{ fontWeight: 600 }}>Most Junior</span>
      </div>

      {/* Tranche descriptions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((seg, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <div
              key={seg.label}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "8px 10px",
                borderRadius: "var(--r-sm)",
                background: isHovered ? "var(--bg-raised)" : "transparent",
                transition: "background 0.15s ease",
                cursor: "pointer",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0, marginTop: 3 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t1)" }}>{seg.label}</span>
                  <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--t2)" }}>{seg.rate}</span>
                  <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>${(seg.notional / 1e9).toFixed(1)}B</span>
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", lineHeight: 1.4, marginTop: 2 }}>
                  {DESCRIPTIONS[seg.label] ?? ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
