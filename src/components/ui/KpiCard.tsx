"use client";
import React from "react";

interface KpiCardProps {
  label: string;
  dotColor?: string;
  value: string;
  delta?: React.ReactNode;
  deltaType?: "up" | "down" | "neutral";
  footer?: React.ReactNode;
  highlighted?: boolean;
}

export default function KpiCard({ label, dotColor, value, delta, deltaType, footer, highlighted }: KpiCardProps) {
  return (
    <div className="card" style={{
      padding: "14px 16px",
      background: highlighted ? "var(--btc-l)" : "var(--bg)",
      minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {dotColor && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
        <span style={{ fontSize: "var(--text-sm)", color: "var(--t2)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </div>
      <div className="mono" style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--t1)", lineHeight: 1.2 }}>{value}</div>
      {delta && (
        <div className="mono" style={{
          fontSize: "var(--text-sm)",
          color: deltaType === "up" ? "var(--green)" : deltaType === "down" ? "var(--red)" : "var(--t3)",
          marginTop: 2,
        }}>{delta}</div>
      )}
      {footer && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)", marginTop: 6, lineHeight: 1.3 }}>{footer}</div>
      )}
    </div>
  );
}
