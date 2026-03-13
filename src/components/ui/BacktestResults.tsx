"use client";

import { useState } from "react";
import type { BacktestSummary } from "@/src/lib/calculators/backtest";
import Badge from "./Badge";

interface Props {
  summary: BacktestSummary;
  /** What this backtest covers, e.g. "BTC Purchase" or "ATM Issuance" */
  label: string;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  High: "var(--green)",
  Moderate: "var(--amber)",
  Low: "var(--red)",
  "Insufficient Data": "var(--t3)",
};

export default function BacktestResults({ summary, label }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const s = summary;

  if (s.periods === 0) {
    return (
      <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--bg-raised)", borderRadius: "var(--r-sm)", fontSize: "var(--text-xs)", color: "var(--t3)" }}>
        <strong>Backtest</strong>: Insufficient confirmed data points to compute accuracy metrics for {label.toLowerCase()} estimation.
      </div>
    );
  }

  const color = CONFIDENCE_COLORS[s.confidence_label] ?? "var(--t3)";

  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg-raised)", borderRadius: "var(--r-sm)", fontSize: "var(--text-xs)", lineHeight: 1.6 }}>
      {/* Confidence disclaimer line */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ color: "var(--t2)" }}>Estimation Accuracy</strong>
        <Badge variant={s.confidence_label === "High" ? "green" : s.confidence_label === "Moderate" ? "amber" : "red"}>
          {s.confidence_score}% Confidence
        </Badge>
        <span style={{ color: "var(--t3)" }}>
          ({s.periods} backtested periods)
        </span>
        {s.improving && (
          <span style={{ color: "var(--green)" }}>Improving</span>
        )}
      </div>

      {/* One-line summary */}
      <div style={{ marginTop: 6, color: "var(--t3)" }}>
        {label} estimates have a mean error of {s.mape.toFixed(1)}% (MAPE) with a{" "}
        {s.bias > 0 ? "positive" : s.bias < 0 ? "negative" : "neutral"} bias of{" "}
        {s.bias > 0 ? "+" : ""}{s.bias.toFixed(1)}%.
        {s.recent_mape < s.mape
          ? ` Recent accuracy (${s.recent_mape.toFixed(1)}% MAPE) is better than the historical average.`
          : ""}
      </div>

      {/* Expandable detail */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 0 0",
          fontSize: "var(--text-xs)",
          color: "var(--t3)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span style={{ transform: showDetails ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease", display: "inline-block" }}>
          ▶
        </span>
        Backtest Details
      </button>

      {showDetails && (
        <div style={{ marginTop: 8 }}>
          {/* Metrics grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 10 }}>
            <MetricCell label="MAPE" value={`${s.mape.toFixed(1)}%`} desc="Mean Abs % Error" />
            <MetricCell label="Bias" value={`${s.bias > 0 ? "+" : ""}${s.bias.toFixed(1)}%`} desc={s.bias > 0 ? "Overestimates" : s.bias < 0 ? "Underestimates" : "Neutral"} />
            <MetricCell label="R²" value={s.r_squared.toFixed(3)} desc="Fit quality" />
            <MetricCell label="Recent MAPE" value={`${s.recent_mape.toFixed(1)}%`} desc="Last 5 periods" />
          </div>

          {/* Period-by-period table */}
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "80px 80px 80px 60px", gap: 4, fontSize: "var(--text-xs)", color: "var(--t3)", fontWeight: 600, marginBottom: 4 }}>
              <span>Period</span>
              <span>Actual</span>
              <span>Estimated</span>
              <span>Error</span>
            </div>
            {s.period_results.slice(0, 15).map((p, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 80px 80px 60px",
                  gap: 4,
                  padding: "3px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "var(--text-xs)",
                }}
              >
                <span style={{ color: "var(--t3)" }}>{p.end}</span>
                <span className="mono">{p.actual.toLocaleString()}</span>
                <span className="mono">{p.estimated.toLocaleString()}</span>
                <span
                  className="mono"
                  style={{
                    color:
                      Math.abs(p.pct_error) < 5
                        ? "var(--green)"
                        : Math.abs(p.pct_error) < 15
                          ? "var(--amber)"
                          : "var(--red)",
                  }}
                >
                  {p.pct_error > 0 ? "+" : ""}{p.pct_error.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCell({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div style={{ padding: "4px 6px", background: "var(--bg)", borderRadius: "var(--r-xs)" }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--t3)" }}>{label}</div>
      <div className="mono" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 9, color: "var(--t3)" }}>{desc}</div>
    </div>
  );
}
