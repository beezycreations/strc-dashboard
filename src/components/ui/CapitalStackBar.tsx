"use client";

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
  // Sort by rank (most senior first)
  const sorted = [...segments].sort((a, b) => a.rank - b.rank);
  const totalNotional = sorted.reduce((sum, s) => sum + s.notional, 0);

  return (
    <div>
      {/* Stacked horizontal bar */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <div style={{ display: "flex", borderRadius: "var(--r-sm)", overflow: "hidden", height: 40 }}>
          {sorted.map((seg) => {
            const widthPct = (seg.notional / totalNotional) * 100;
            const isHighlighted = highlightTicker && seg.label.includes(highlightTicker);
            return (
              <div
                key={seg.label}
                style={{
                  width: `${widthPct}%`,
                  background: seg.color,
                  opacity: isHighlighted ? 1 : 0.75,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  borderRight: "1px solid var(--bg)",
                  transition: "opacity 0.2s ease",
                }}
                title={`${seg.label}: $${(seg.notional / 1e9).toFixed(1)}B (${seg.rate})`}
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

        {/* BTC NAV marker */}
        {btcNav > 0 && (() => {
          const navPct = Math.min(100, (btcNav / totalNotional) * 100);
          return (
            <div style={{ position: "absolute", left: `${navPct}%`, top: -6, bottom: -6, borderLeft: "2px dashed var(--btc)", pointerEvents: "none" }}>
              <span className="mono" style={{ position: "absolute", top: -16, left: 4, fontSize: "var(--text-xs)", color: "var(--btc-d)", whiteSpace: "nowrap" }}>
                BTC NAV ${(btcNav / 1e9).toFixed(1)}B
              </span>
            </div>
          );
        })()}
      </div>

      {/* Notional labels row */}
      <div style={{ display: "flex", marginBottom: 16 }}>
        {sorted.map((seg) => {
          const widthPct = (seg.notional / totalNotional) * 100;
          return (
            <div key={seg.label} style={{ width: `${widthPct}%`, textAlign: "center", padding: "0 2px" }}>
              <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--t2)" }}>
                ${(seg.notional / 1e9).toFixed(1)}B
              </span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginLeft: 4 }}>
                {seg.rate}
              </span>
            </div>
          );
        })}
      </div>

      {/* Seniority arrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: "var(--text-xs)", color: "var(--t3)" }}>
        <span style={{ fontWeight: 600 }}>Most Senior</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span style={{ fontWeight: 600 }}>Most Junior</span>
      </div>

      {/* Tranche descriptions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((seg) => (
          <div key={seg.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0, marginTop: 3 }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--t1)" }}>{seg.label}</span>
              <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginLeft: 6 }}>{seg.rate}</span>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", lineHeight: 1.4, marginTop: 2 }}>
                {DESCRIPTIONS[seg.label] ?? ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
