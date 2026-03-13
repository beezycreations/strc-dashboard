"use client";
import Badge from "./Badge";

type Signal = "buy" | "hold" | "trim";

interface SignalPanelProps {
  currentSignal: Signal;
  strcPrice: number;
  btcCoverage: number;
}

const signalConfig: Record<Signal, { label: string; variant: "green" | "amber" | "red"; desc: string }> = {
  buy:  { label: "BUY", variant: "green", desc: "Price < $98 with coverage > 3.0×" },
  hold: { label: "HOLD", variant: "amber", desc: "Price $98–$102, stable range" },
  trim: { label: "TRIM", variant: "red", desc: "Price > $104, yield compression risk" },
};

export function deriveSignal(strcPrice: number, btcCoverage: number): Signal {
  if (strcPrice < 98 && btcCoverage > 3.0) return "buy";
  if (strcPrice > 104) return "trim";
  return "hold";
}

export default function SignalPanel({ currentSignal, strcPrice, btcCoverage }: SignalPanelProps) {
  const cfg = signalConfig[currentSignal];
  return (
    <div className="card" style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Position Signal</span>
        <Badge variant={cfg.variant}>{cfg.label}</Badge>
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--t2)", marginBottom: 10 }}>{cfg.desc}</div>
      <div style={{ display: "flex", gap: 24 }}>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>STRC Price</div>
          <div className="mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>${strcPrice.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>BTC Coverage</div>
          <div className="mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{btcCoverage.toFixed(1)}×</div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="badge badge-green" style={{ opacity: currentSignal === "buy" ? 1 : 0.4 }}>Buy &lt; $98</span>
        <span className="badge badge-amber" style={{ opacity: currentSignal === "hold" ? 1 : 0.4 }}>Hold $98–102</span>
        <span className="badge badge-red" style={{ opacity: currentSignal === "trim" ? 1 : 0.4 }}>Trim &gt; $104</span>
      </div>
    </div>
  );
}
