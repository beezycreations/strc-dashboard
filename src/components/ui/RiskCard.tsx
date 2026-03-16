"use client";

import { useState } from "react";
import Badge from "./Badge";

export default function RiskCard({ title, status, children, methodology }: { title: string; status: "safe" | "watch" | "alert"; children: React.ReactNode; methodology?: React.ReactNode }) {
  const [showMethodology, setShowMethodology] = useState(false);
  const variant = status === "safe" ? "green" : status === "watch" ? "amber" : "red";
  const label = status.toUpperCase();
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{title}</span>
        <Badge variant={variant}>{label}</Badge>
      </div>
      {children}
      {methodology && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: 0,
              fontSize: "var(--text-xs)",
              color: "var(--t3)",
              fontWeight: 500,
            }}
          >
            <span style={{ transform: showMethodology ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease", display: "inline-block" }}>
              ▶
            </span>
            Methodology
          </button>
          {showMethodology && (
            <div style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--t3)", lineHeight: 1.6 }}>
              {methodology}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
